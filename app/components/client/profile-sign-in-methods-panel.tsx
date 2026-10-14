import ProfileReadOnlyRow from "@/components/client/profile-read-only-row";
import Panel from "@/components/ui/panel";

type ProfileSignInMethodsPanelProps = {
  isGoogleLinked: boolean;
};

// Static: nothing here links or unlinks a method.
export default function ProfileSignInMethodsPanel({
  isGoogleLinked,
}: ProfileSignInMethodsPanelProps): React.ReactNode {
  return (
    <Panel title="Sign-in methods">
      <dl className="divide-y divide-line">
        <ProfileReadOnlyRow label="Email link" isMono>
          Available
        </ProfileReadOnlyRow>
        <ProfileReadOnlyRow label="Google" isMono>
          {isGoogleLinked ? "Linked" : "Not linked"}
        </ProfileReadOnlyRow>
      </dl>
    </Panel>
  );
}
