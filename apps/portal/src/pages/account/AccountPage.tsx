import { useApplicantAuth } from '../../hooks/useApplicantAuth';

const CONTACT_ORDER_LABELS: Record<string, string> = {
  primary: 'Contact principal',
  secondary: 'Contact secondaire',
  tertiary: 'Contact tertiaire',
};

/** /compte - read-only: the API offers no self-service profile or password change yet. */
export default function AccountPage() {
  const { applicant } = useApplicantAuth();
  if (!applicant) return null;

  const rows: Array<[string, string]> = [
    ['Nom', applicant.fullName],
    ['E-mail', applicant.email],
    ['Rôle', CONTACT_ORDER_LABELS[applicant.contactOrder] ?? 'Contact'],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-anac-navy text-xl font-semibold">Mon compte</h1>
        <p className="text-anac-muted text-sm">Informations de votre compte postulant</p>
      </div>
      <dl className="card divide-y divide-anac-border !py-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
            <dt className="text-anac-muted">{label}</dt>
            <dd className="font-medium text-anac-navy break-all">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-anac-muted">Pour modifier ces informations, contactez l&apos;ANAC.</p>
    </div>
  );
}
