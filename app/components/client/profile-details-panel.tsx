import ProfileReadOnlyRow from "@/components/client/profile-read-only-row";
import Button from "@/components/ui/button";
import Field from "@/components/ui/field";
import FormError from "@/components/ui/form-error";
import Input from "@/components/ui/input";
import Panel from "@/components/ui/panel";
import { useProfileNameForm } from "@/hooks/use-profile-name-form";
import type { Profile } from "@/lib/auth/auth";
import { PROFILE_COPY } from "@/lib/profile";
import { ROLE_LABEL } from "@/lib/roles";

type ProfileDetailsPanelProps = {
  profile: Profile;
};

export default function ProfileDetailsPanel({
  profile,
}: ProfileDetailsPanelProps): React.ReactNode {
  const form = useProfileNameForm(profile.name);

  return (
    <Panel title="Details">
      <form
        noValidate
        onSubmit={form.handleSubmit}
        className="flex flex-col gap-4 px-3 py-3"
      >
        {form.banner && <FormError variant="banner">{form.banner}</FormError>}
        <Field label="Display name" error={form.fieldError ?? undefined}>
          {(control) => (
            <Input
              {...control}
              ref={form.inputRef}
              name="name"
              autoComplete="name"
              value={form.name}
              onChange={form.handleChange}
              onBlur={form.handleBlur}
              className="md:max-w-sm"
            />
          )}
        </Field>
        <Button
          type="submit"
          variant="primary"
          isPending={form.isSaving}
          pendingLabel={PROFILE_COPY.saving}
          className="self-start"
        >
          Save
        </Button>
      </form>
      <dl className="divide-y divide-line border-t border-line">
        <ProfileReadOnlyRow label="Email">{profile.email}</ProfileReadOnlyRow>
        <ProfileReadOnlyRow label="Role">
          {ROLE_LABEL[profile.role]}
        </ProfileReadOnlyRow>
        <ProfileReadOnlyRow label="Client">
          {profile.clientName}
        </ProfileReadOnlyRow>
      </dl>
    </Panel>
  );
}
