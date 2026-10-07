//! High refresh rate rendering on Linux.
//!
//! WebKitGTK paces frames by calling libdrm's `drmWaitVBlank` on the window's
//! monitor. NVIDIA's driver rejects that call, so WebKit falls back to a timer
//! fixed at 60 fps. This binary exports its own `drmWaitVBlank`, which WebKit
//! binds to instead of libdrm's: it tries the real call and, when the driver
//! rejects it, sleeps until the next frame at the monitor's real refresh rate.

use std::ffi::{CStr, c_int, c_long, c_uint};
use std::sync::{Once, OnceLock};

const VBLANK_RELATIVE: c_uint = 0x1;
const VBLANK_HIGH_CRTC_MASK: c_uint = 0x3e;
const VBLANK_HIGH_CRTC_SHIFT: c_uint = 1;
const VBLANK_EVENT: c_uint = 0x400_0000;
const VBLANK_SECONDARY: c_uint = 0x2000_0000;
const MODE_FLAG_INTERLACE: u32 = 1 << 4;
const MODE_FLAG_DBLSCAN: u32 = 1 << 5;
const NANOS: u64 = 1_000_000_000;

/// libdrm's `drmVBlank` union, as its reply. The request's `signal` overlaps `tval_sec`.
#[repr(C)]
pub struct VBlank {
    kind: c_uint,
    sequence: c_uint,
    tval_sec: c_long,
    tval_usec: c_long,
}

/// The start of libdrm's `drmModeRes`; libdrm allocates it.
#[repr(C)]
struct ModeRes {
    _count_fbs: c_int,
    _fbs: *mut u32,
    count_crtcs: c_int,
    crtcs: *mut u32,
}

/// The start of libdrm's `drmModeCrtc`, through the mode's flags.
#[repr(C)]
struct ModeCrtc {
    _crtc_id: u32,
    _buffer_id: u32,
    _x: u32,
    _y: u32,
    _width: u32,
    _height: u32,
    mode_valid: c_int,
    clock: u32,
    _hdisplay: u16,
    _hsync_start: u16,
    _hsync_end: u16,
    htotal: u16,
    _hskew: u16,
    _vdisplay: u16,
    _vsync_start: u16,
    _vsync_end: u16,
    vtotal: u16,
    vscan: u16,
    _vrefresh: u32,
    flags: u32,
}

struct Drm {
    wait_vblank: unsafe extern "C" fn(c_int, *mut VBlank) -> c_int,
    get_resources: unsafe extern "C" fn(c_int) -> *mut ModeRes,
    free_resources: unsafe extern "C" fn(*mut ModeRes),
    get_crtc: unsafe extern "C" fn(c_int, u32) -> *mut ModeCrtc,
    free_crtc: unsafe extern "C" fn(*mut ModeCrtc),
}

/// A function from the libraries loaded after this binary, i.e. libdrm.
fn next<T: Copy>(name: &CStr) -> Option<T> {
    // SAFETY: dlsym only reads the name.
    let ptr = unsafe { libc::dlsym(libc::RTLD_NEXT, name.as_ptr()) };
    // SAFETY: the caller names a function of type T.
    (!ptr.is_null()).then(|| unsafe { std::mem::transmute_copy(&ptr) })
}

fn drm() -> Option<&'static Drm> {
    static DRM: OnceLock<Option<Drm>> = OnceLock::new();
    DRM.get_or_init(|| {
        Some(Drm {
            wait_vblank: next(c"drmWaitVBlank")?,
            get_resources: next(c"drmModeGetResources")?,
            free_resources: next(c"drmModeFreeResources")?,
            get_crtc: next(c"drmModeGetCrtc")?,
            free_crtc: next(c"drmModeFreeCrtc")?,
        })
    })
    .as_ref()
}

fn crtc_index(kind: c_uint) -> usize {
    if kind & VBLANK_SECONDARY != 0 {
        1
    } else {
        ((kind & VBLANK_HIGH_CRTC_MASK) >> VBLANK_HIGH_CRTC_SHIFT) as usize
    }
}

/// Refresh rate in Hz, computed like WebKit does for its other DRM backend.
fn mode_rate(crtc: &ModeCrtc) -> Option<f64> {
    let total = f64::from(crtc.htotal) * f64::from(crtc.vtotal);
    if crtc.mode_valid == 0 || total == 0.0 {
        return None;
    }
    let mut hz = f64::from(crtc.clock) * 1000.0 / total;
    if crtc.flags & MODE_FLAG_INTERLACE != 0 {
        hz *= 2.0;
    }
    if crtc.flags & MODE_FLAG_DBLSCAN != 0 {
        hz /= 2.0;
    }
    if crtc.vscan > 1 {
        hz /= f64::from(crtc.vscan);
    }
    (hz >= 1.0).then_some(hz)
}

fn refresh_rate(drm: &Drm, fd: c_int, index: usize) -> Option<f64> {
    // SAFETY: libdrm returns null or a valid resource list we free below.
    let res = unsafe { (drm.get_resources)(fd) };
    if res.is_null() {
        return None;
    }
    // SAFETY: `crtcs` holds `count_crtcs` ids.
    let crtc_id = unsafe {
        let r = &*res;
        let id = (index < r.count_crtcs.max(0) as usize).then(|| *r.crtcs.add(index));
        (drm.free_resources)(res);
        id
    }?;
    // SAFETY: as above, freed right after reading.
    unsafe {
        let crtc = (drm.get_crtc)(fd, crtc_id);
        if crtc.is_null() {
            return None;
        }
        let hz = mode_rate(&*crtc);
        (drm.free_crtc)(crtc);
        hz
    }
}

fn now() -> u64 {
    let mut ts = libc::timespec {
        tv_sec: 0,
        tv_nsec: 0,
    };
    // SAFETY: writes into `ts`.
    unsafe { libc::clock_gettime(libc::CLOCK_MONOTONIC, &mut ts) };
    ts.tv_sec as u64 * NANOS + ts.tv_nsec as u64
}

/// Sleeps until `frames` frame boundaries from now pass and returns the last one.
fn sleep_frames(hz: f64, frames: u32) -> (u64, u64) {
    let period = (NANOS as f64 / hz) as u64;
    let tick = now() / period + u64::from(frames);
    let target = tick * period;
    let ts = libc::timespec {
        tv_sec: (target / NANOS) as libc::time_t,
        tv_nsec: (target % NANOS) as c_long,
    };
    // SAFETY: an absolute sleep on a valid timespec; retried when a signal cuts it short.
    while unsafe {
        libc::clock_nanosleep(
            libc::CLOCK_MONOTONIC,
            libc::TIMER_ABSTIME,
            &ts,
            std::ptr::null_mut(),
        )
    } == libc::EINTR
    {}
    (tick, target)
}

/// Replaces libdrm's `drmWaitVBlank` for everything in this process.
///
/// # Safety
/// `vbl` must be null or point to a `drmVBlank`, as for libdrm's.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn drmWaitVBlank(fd: c_int, vbl: *mut VBlank) -> c_int {
    let Some(drm) = drm() else {
        return -libc::ENOSYS;
    };
    if vbl.is_null() {
        // SAFETY: passes the caller's arguments through.
        return unsafe { (drm.wait_vblank)(fd, vbl) };
    }
    // SAFETY: the caller passes a valid drmVBlank; libdrm may rewrite it, so copy the request.
    let (kind, frames) = unsafe { ((*vbl).kind, (*vbl).sequence) };
    let ret = unsafe { (drm.wait_vblank)(fd, vbl) };
    if ret == 0 || kind & (VBLANK_RELATIVE | VBLANK_EVENT) != VBLANK_RELATIVE {
        return ret;
    }
    let Some(hz) = refresh_rate(drm, fd, crtc_index(kind)) else {
        return ret;
    };
    static LOGGED: Once = Once::new();
    LOGGED
        .call_once(|| eprintln!("vblank: the driver can't wait for vblank, pacing at {hz:.1} Hz"));
    let (tick, at) = if frames == 0 {
        let at = now();
        (at / (NANOS as f64 / hz) as u64, at)
    } else {
        sleep_frames(hz, frames)
    };
    // SAFETY: as above.
    unsafe {
        *vbl = VBlank {
            kind,
            sequence: tick as c_uint,
            tval_sec: (at / NANOS) as c_long,
            tval_usec: (at % NANOS / 1000) as c_long,
        };
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn crtc(clock: u32, htotal: u16, vtotal: u16, flags: u32) -> ModeCrtc {
        ModeCrtc {
            _crtc_id: 1,
            _buffer_id: 0,
            _x: 0,
            _y: 0,
            _width: 0,
            _height: 0,
            mode_valid: 1,
            clock,
            _hdisplay: 0,
            _hsync_start: 0,
            _hsync_end: 0,
            htotal,
            _hskew: 0,
            _vdisplay: 0,
            _vsync_start: 0,
            _vsync_end: 0,
            vtotal,
            vscan: 0,
            _vrefresh: 0,
            flags,
        }
    }

    #[test]
    fn rates() {
        // 2560x1440 at 500 Hz and 1920x1080 at 60 Hz (CEA timings).
        let hz = mode_rate(&crtc(1_989_000, 2600, 1530, 0)).unwrap();
        assert!((hz - 500.0).abs() < 0.1, "{hz}");
        let hz = mode_rate(&crtc(148_500, 2200, 1125, 0)).unwrap();
        assert!((hz - 60.0).abs() < 0.01, "{hz}");
        let hz = mode_rate(&crtc(74_250, 2200, 1125, MODE_FLAG_INTERLACE)).unwrap();
        assert!((hz - 60.0).abs() < 0.01, "{hz}");
        assert!(mode_rate(&crtc(0, 0, 0, 0)).is_none());
    }

    #[test]
    fn crtc_indexes() {
        assert_eq!(crtc_index(VBLANK_RELATIVE), 0);
        assert_eq!(crtc_index(VBLANK_RELATIVE | VBLANK_SECONDARY), 1);
        assert_eq!(
            crtc_index(VBLANK_RELATIVE | (3 << VBLANK_HIGH_CRTC_SHIFT)),
            3
        );
    }

    #[test]
    fn sleeps_to_frame_boundaries() {
        let start = now();
        let (tick, at) = sleep_frames(1000.0, 2);
        let end = now();
        assert_eq!(at, tick * 1_000_000);
        assert!(end >= at && at > start + 1_000_000 && at <= start + 2_000_000);
    }
}
