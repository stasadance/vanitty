# Vanitty starts bash with this file in place of its startup files, so first
# load those the way bash would have.
if [[ -n $VANITTY_LOGIN ]]; then
    [[ -r /etc/profile ]] && . /etc/profile
    for __vanitty_rc in ~/.bash_profile ~/.bash_login ~/.profile; do
        if [[ -r $__vanitty_rc ]]; then
            . "$__vanitty_rc"
            break
        fi
    done
    unset __vanitty_rc
else
    [[ -r /etc/bash.bashrc ]] && . /etc/bash.bashrc
    [[ -r ~/.bashrc ]] && . ~/.bashrc
fi
unset VANITTY_LOGIN

# Each pane also keeps its own history in $VANITTY_HISTORY, like Terminal.app.
# The shared history works as before; a restored pane loads its own commands
# on top, so the up arrow brings back what ran in that pane first. Skipped
# when the user's config turns saving history off.
if [[ -n $VANITTY_HISTORY && -n $HISTFILE ]]; then
    __vanitty_history=$VANITTY_HISTORY
    __vanitty_seen=

    __vanitty_prompt() {
        local status=$?
        if [[ -z $__vanitty_seen && -r $__vanitty_history ]]; then
            # Keep the file to the size the shared history is kept to.
            local max=${HISTFILESIZE:-500} lines
            if [[ $max =~ ^[0-9]+$ ]]; then
                mapfile -t lines < "$__vanitty_history"
                ((${#lines[@]} > max)) && printf '%s\n' "${lines[@]: -max}" > "$__vanitty_history"
            fi
            history -r "$__vanitty_history"
        fi
        __vanitty_seen=$HISTCMD
        return $status
    }

    # Runs in a subshell just before each command, so a command that is still
    # running when the pane closes is kept too.
    __vanitty_record() {
        [[ $HISTCMD == "$__vanitty_seen" ]] && return
        local HISTTIMEFORMAT= entry
        entry=$(history 1)
        [[ $entry =~ ^[[:space:]]*[0-9]+\*?\ \ (.+)$ ]] &&
            printf '%s\n' "${BASH_REMATCH[1]}" >> "$__vanitty_history"
    }

    PROMPT_COMMAND="__vanitty_prompt${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
    PS0="${PS0-}\$(__vanitty_record)"
fi
unset VANITTY_HISTORY
