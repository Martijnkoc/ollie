import { blockAction } from "@/app/actions/community";
import { ActionForm } from "./ActionForm";
import { SubmitButton } from "./SubmitButton";

export function BlockConfirm({ userId, name, back }: { userId: string; name: string; back: string }) {
  return (
    <>
      <p>
        Jullie zien elkaar niet meer, ook niet in de lounge. Nieuwe verzoeken, berichten en uitnodigingen zijn niet meer mogelijk. Geplande
        videodates tussen jullie worden geannuleerd. {name} krijgt hier geen bericht over.
      </p>
      <div className="row">
        <ActionForm action={blockAction.bind(null, userId, back)}>
          <SubmitButton className="btn danger">Blokkeren</SubmitButton>
        </ActionForm>
        <form method="dialog">
          <button type="submit" className="btn secondary">
            Annuleren
          </button>
        </form>
      </div>
    </>
  );
}
