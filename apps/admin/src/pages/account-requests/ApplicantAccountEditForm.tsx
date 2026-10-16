import { FormEvent, useState } from 'react';
import { Button } from '../../components/ui/button';
import type { ApplicantAccountView } from './AccountRequestsPage';

const CONTACT_ORDER_OPTIONS = [
  { value: 'primary', label: 'Responsable principal' },
  { value: 'secondary', label: 'Utilisateur secondaire' },
  { value: 'tertiary', label: 'Utilisateur tertiaire' },
];

const INPUT_CLASS =
  'mt-1 w-full rounded-md border border-anac-border px-3 py-2 text-sm outline-none focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15';
const LABEL_CLASS = 'text-xs font-semibold text-anac-muted';

export interface ApplicantAccountEditValues {
  fullName: string;
  email: string;
  phone: string | null;
  contactOrder: string;
}

export function ApplicantAccountEditForm({
  account,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  account: ApplicantAccountView;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: ApplicantAccountEditValues) => void;
}) {
  const [fullName, setFullName] = useState(account.fullName);
  const [email, setEmail] = useState(account.email);
  const [phone, setPhone] = useState(account.phone ?? '');
  const [contactOrder, setContactOrder] = useState(account.contactOrder);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() === '' ? null : phone.trim(),
      contactOrder,
    });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit} noValidate>
      <div>
        <label className={LABEL_CLASS} htmlFor="applicant-edit-name">
          Nom complet
        </label>
        <input
          id="applicant-edit-name"
          className={INPUT_CLASS}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
      </div>
      <div>
        <label className={LABEL_CLASS} htmlFor="applicant-edit-email">
          Email
        </label>
        <input
          id="applicant-edit-email"
          className={INPUT_CLASS}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <label className={LABEL_CLASS} htmlFor="applicant-edit-phone">
          Téléphone
        </label>
        <input
          id="applicant-edit-phone"
          className={INPUT_CLASS}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>
      <div>
        <label className={LABEL_CLASS} htmlFor="applicant-edit-order">
          Ordre de contact
        </label>
        <select
          id="applicant-edit-order"
          className={INPUT_CLASS}
          value={contactOrder}
          onChange={(event) => setContactOrder(event.target.value)}
        >
          {CONTACT_ORDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <p className={LABEL_CLASS}>Organisation</p>
        <p className="mt-1 text-sm text-anac-navy">{account.organisationName}</p>
        <p className="text-xs text-anac-muted">
          {"L'organisme associé ne peut pas être modifié depuis cette fiche."}
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-anac-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={busy}>
          Enregistrer les modifications
        </Button>
      </div>
    </form>
  );
}
