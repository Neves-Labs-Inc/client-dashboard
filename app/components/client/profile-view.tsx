import ProfileDetailsPanel from "@/components/client/profile-details-panel";
import ProfileLeavePanel from "@/components/client/profile-leave-panel";
import ProfileSignInMethodsPanel from "@/components/client/profile-sign-in-methods-panel";
import PageHeader from "@/components/ui/page-header";
import type { Profile } from "@/lib/auth/auth";

type ProfileViewProps = {
  profile: Profile;
};

// The client Profile page: no nav item is active on it.
export default function ProfileView({
  profile,
}: ProfileViewProps): React.ReactNode {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader
        breadcrumb={[
          { label: profile.clientName, isTruncated: true },
          { label: "Profile" },
        ]}
        title="Profile"
      />
      <ProfileDetailsPanel profile={profile} />
      <ProfileSignInMethodsPanel isGoogleLinked={profile.isGoogleLinked} />
      <ProfileLeavePanel
        clientName={profile.clientName}
        canLeave={profile.canLeave}
      />
    </div>
  );
}
