/** Fira Code's ligatures, read from its GSUB table; longest first so the longest match wins. */
const LIGATURES = String.raw`
<----> <====> <---> <===> ---> <--- <--> <!-- <=== <==> <||| ===> |||> ___ _|_ --- --< --> --|
-<- -<< ->- ->> -|- -|| ;;; ::: ::< ::= ::> :<- :<: :<= :>- :>: !!! !!. !== ??? ..? ... ..< ..=
[== *** **/ **> *>> /// //= /=: /=! /=/ /=< /== /=> /=| &&& #_( ### %%% +++ +>> <-- <-< <-> <-|
<:: <:< <:> <*> </> <+> <<- <<* <<+ <<< <<$ <=: <=! <=/ <=< <== <=> <=| <|> <|| <~> <~~ <$> =/=
=<< =<= ==] ==/ ==< === ==> ==| =>= =>> =|= =|| >-- >-< >-> >-| >:: >:< >:> >=: >=! >=/ >=< >==
>=> >=| >>- >>> |-- |-< |-> |-| |=: |=! |=/ |=< |== |=> |=| ||- ||> ||| ~~- ~~@ ~~> ~~~ $>> www
__ -- -< -> -| -~ ;; :: :< := :> !! != ?? ?. ?= .? .. [| ]# {| ** */ *> /* // /\ /= /> \/ && #_
#: #! #? #( #[ #{ ## #= %% ^= ++ +> <- <: <* </ <+ << <= <> <| <~ <$ =: =! == => =| >- >: >= >>
|- |] |} |> || ~- ~@ ~> ~~ $>
`
    .trim()
    .split(/\s+/)
    .sort((a, b) => b.length - a.length);

const BY_FIRST = new Map<string, string[]>();
for (const ligature of LIGATURES) {
    BY_FIRST.set(ligature[0], [...(BY_FIRST.get(ligature[0]) ?? []), ligature]);
}

/** Runs of `text` to draw as one string so the font can join them, like `=>` or `&&`. */
export function ligatureRanges(text: string): [number, number][] {
    const ranges: [number, number][] = [];
    for (let index = 0; index < text.length; index++) {
        const match = BY_FIRST.get(text[index])?.find((ligature) =>
            text.startsWith(ligature, index),
        );
        if (!match) continue;
        ranges.push([index, index + match.length]);
        index += match.length - 1;
    }
    return ranges;
}
