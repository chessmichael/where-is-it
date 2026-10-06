// "How to use": what the app does and how to talk to it, for someone opening
// it for the first time. Examples are things people actually say.

export default function Help({ onStart }: { onStart?: () => void }) {
  return (
    <div className="help">
      <p className="help-lede">
        Where Is It remembers where you keep things. Tell it where something is, the way you’d tell a friend. Later, ask it
        where that thing is.
      </p>

      <section>
        <h3>Tell it where things are</h3>
        <p>Say it in one breath, room first if you can. Long, rambling descriptions are fine — it pulls out every item.</p>
        <ul className="help-examples">
          <li>“The extension cords are in the blue bin on the top shelf in the garage.”</li>
          <li>“I moved the red tote up to the attic.”</li>
          <li>“I lent the ladder to Dave next door.”</li>
          <li>“The hall closet has three shelves — the top one is all board games.”</li>
        </ul>
        <p>
          When a box or tote moves, just say the box moved. Everything in it goes with it.
        </p>
      </section>

      <section>
        <h3>Ask where things are</h3>
        <ul className="help-examples">
          <li>“Where’s my passport?”</li>
          <li>“What’s in the hall closet?”</li>
          <li>“Which shelf are the records on?”</li>
        </ul>
      </section>

      <section>
        <h3>It will ask you questions</h3>
        <p>
          If something could be in two places — two red totes, “the drawer” when there are several — it asks which one
          rather than guess. Answer by talking, or tap one of the suggested answers. If you don’t know, say “you decide”.
        </p>
        <p>
          For bookcases, dressers and shelving it may show a sketch of how it thinks the shelves are arranged. Say whether
          it’s right, and what to change if it isn’t.
        </p>
      </section>

      <section>
        <h3>Voice or typing</h3>
        <p>
          Use the Voice / Type switch at the bottom of the Talk screen. In Voice, it listens and talks back; pauses are fine
          — it waits until you’ve finished. In Type, use the keyboard and read the answers.
        </p>
      </section>

      <section>
        <h3>See everything you’ve told it</h3>
        <p>Open the menu (top left on a phone; the sidebar on a computer):</p>
        <dl className="help-places">
          <dt>House</dt>
          <dd>
            Everything filed, room by room. Tap a place to open it. Furniture with shelves is drawn as boxes once it knows
            the layout.
          </dd>
          <dt>Inspect</dt>
          <dd>Checks for things that might be mixed up, and the history of each item.</dd>
          <dt>Files</dt>
          <dd>Download all of your data, including a log of every conversation. It’s yours to keep.</dd>
        </dl>
        <p>
          You can ask about something as soon as you’ve said it. It appears on the House screen after a tidy-up, which runs
          on its own once a batch builds up (or within a few hours) — tap “Tidy up now” there to do it right away. On a
          computer, the same address opens a larger view for browsing and finding things.
        </p>
      </section>

      <section>
        <h3>Tips</h3>
        <ul>
          <li>Name containers by what they are — “the red tote”, “the box of winter clothes” — not where they sit.</li>
          <li>For a piece of furniture, describe it part by part: “the bookcase has a tall shelf on the left and two short ones on the right.”</li>
          <li>Made a mistake? Just say so: “no, I meant the hall closet.”</li>
        </ul>
      </section>

      {onStart && (
        <button className="primary wide" onClick={onStart}>
          Start talking
        </button>
      )}
    </div>
  )
}
