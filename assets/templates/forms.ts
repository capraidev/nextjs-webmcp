/**
 * lib/agents/forms.ts — the site forms an agent may FILL (declarative WebMCP).
 * Pure module: read by the forms (client) and by llms.txt (server).
 *
 * Why forms and not registry tools: these are actions with consequences.
 * Chrome's guidance is to keep them in visible UI and not to duplicate them in an
 * overlapping imperative tool. The agent fills the fields; the person reviews and
 * presses submit — that is the confirmation. Hence: no `toolautosubmit`.
 *
 * Deliberately NOT here: registration/consent, payments, anything that creates
 * legal or financial commitments. Lighthouse will list them under "Forms missing
 * declarative WebMCP" — that is a documented choice.
 */
export const AGENT_FORMS = {
  newsletter: {
    toolname: "subscribe_newsletter",
    tooldescription:
      "Subscribe the visitor's own email address to the EXAMPLE.COM newsletter. A confirmation email follows " +
      "(double opt-in). Fill it only with the visitor's own address and consent; the visitor submits the form.",
    fields: { email: "The visitor's own email address." },
    where: "the footer of every page",
  },
  contact: {
    toolname: "send_contact_message",
    tooldescription:
      "Send a message to the site owner. Fill it with the visitor's own name and email so that a reply is possible; " +
      "the visitor reviews and submits the form.",
    fields: {
      name: "The visitor's name.",
      email: "The visitor's email address, where the reply will go.",
      message: "The message, 10 to 5000 characters.",
    },
    where: "the contact page",
  },
} as const;

/** What the draft adds to the submit event when an agent submits. */
type AgentSubmit = { agentInvoked?: boolean; respondWith?: (p: Promise<unknown>) => void };

/**
 * Call DURING the submit handler (like preventDefault). If an agent submitted the
 * form, promises it a response and returns the function that settles it:
 * a string resolves (what the person reads in the toast), an Error rejects —
 * so the agent never waits for a response that will not come.
 */
export function agentResponder(event: Event): (outcome: string | Error) => void {
  const submit = event as Event & AgentSubmit;
  if (!submit.agentInvoked || typeof submit.respondWith !== "function") return () => {};
  let settle: (outcome: string | Error) => void = () => {};
  submit.respondWith(
    new Promise<string>((resolve, reject) => {
      settle = (o) => (o instanceof Error ? reject(o) : resolve(o));
    })
  );
  return (o) => settle(o);
}

/*
Usage in a form (controlled inputs):

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The browser may fill fields for the agent WITHOUT input events: read the DOM.
    const email = String(new FormData(e.currentTarget).get("email") ?? emailState).trim();
    const respond = agentResponder(e.nativeEvent);
    startTransition(async () => {
      const result = await subscribe(email).catch((err: unknown) => {
        respond(err instanceof Error ? err : new Error(String(err)));
        throw err;
      });
      respond(result.message);
      // …toast, reset…
    });
  }

  <form onSubmit={handleSubmit}
        toolname={AGENT_FORMS.newsletter.toolname}
        tooldescription={AGENT_FORMS.newsletter.tooldescription}>
    <input name="email" type="email"
           toolparamdescription={AGENT_FORMS.newsletter.fields.email}
           value={emailState} onChange={…} />
  </form>
*/
