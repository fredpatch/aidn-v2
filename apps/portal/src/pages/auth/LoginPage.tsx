import { useId, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Loader2, Plane } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { api, apiErrorMessage } from '../../lib/axios';
import { notify } from '../../lib/notify';
import { useApplicantAuth } from '../../hooks/useApplicantAuth';

import { fadeUp } from './animations';
import { GridPattern, FormField, EyeToggle, ServerError } from './components';

const loginSchema = z.object({
  email: z.string().min(1, "L'email est requis").email('Adresse email invalide'),
  password: z.string().min(1, 'Le mot de passe est requis'),
});

const accountRequestSchema = z.object({
  organisationNameInput: z.string().min(2, "Le nom de l'organisme est requis"),
  legalAddress: z.string().min(2, "L'adresse legale est requise"),
  requestedEmail: z.string().email('Email organisme invalide'),
  phone: z.string().optional(),
  originalApprovalNumber: z.string().optional(),
  contactFullName: z.string().min(2, 'Le nom du contact est requis'),
  contactEmail: z.string().email('Email contact invalide'),
  contactPhone: z.string().optional(),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caracteres'),
  honeypot: z.string().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;
type AccountRequestFormData = z.infer<typeof accountRequestSchema>;

export default function LoginPage() {
  const { refreshMe } = useApplicantAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'login' | 'request'>('login');
  const [formStartedAt] = useState(() => new Date().toISOString());

  const emailId = useId();
  const passwordId = useId();

  useEffect(() => {
    if (sessionStorage.getItem('session_expired')) {
      sessionStorage.removeItem('session_expired');
      const message = 'Votre session a expire. Veuillez vous reconnecter.';
      setServerError(message);
      notify.warning(message);
    }
  }, []);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const requestForm = useForm<AccountRequestFormData>({
    resolver: zodResolver(accountRequestSchema),
    defaultValues: {
      organisationNameInput: '',
      legalAddress: '',
      requestedEmail: '',
      phone: '',
      originalApprovalNumber: '',
      contactFullName: '',
      contactEmail: '',
      contactPhone: '',
      password: '',
      honeypot: '',
    },
  });

  const { errors, isSubmitting } = form.formState;
  const requestErrors = requestForm.formState.errors;
  const requestSubmitting = requestForm.formState.isSubmitting;
  const errCls = (has: boolean) => (has ? 'border-anac-danger focus:ring-red-300' : '');

  async function onSubmit(data: LoginFormData) {
    setServerError(null);
    try {
      await api.post('/applicant-auth/login', data);
      await refreshMe();
      notify.success('Connexion reussie.');
    } catch (err) {
      const message = apiErrorMessage(err, 'Connexion impossible.');
      setServerError(message);
      notify.error(message);
    }
  }

  async function onRequestSubmit(data: AccountRequestFormData) {
    setRequestError(null);
    setRequestSuccess(null);
    try {
      await api.post('/account-requests', { ...data, formStartedAt });
      requestForm.reset();
      setRequestSuccess(
        "Votre demande a ete envoyee. L'ANAC verifiera l'organisme avant activation du compte."
      );
      notify.success('Demande de compte envoyee.');
    } catch (err) {
      const message = apiErrorMessage(err, 'Demande de compte impossible.');
      setRequestError(message);
      notify.error(message);
    }
  }

  return (
    <div className="min-h-dvh bg-anac-gray flex items-center justify-center p-4 relative overflow-hidden">
      <GridPattern />

      <motion.div
        className="w-full max-w-[420px] relative z-10"
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className="text-center mb-7">
          <motion.div
            className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-anac-navy shadow-lg mb-4 relative overflow-hidden"
            whileHover={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-anac-blue/40 to-transparent" />
            <Plane className="text-white relative z-10" size={22} strokeWidth={1.75} />
          </motion.div>
          <h1 className="text-xl font-bold text-anac-navy tracking-tight">AIDN</h1>
          <p className="text-anac-muted text-[11px] mt-0.5 leading-relaxed">
            Portail Postulant - Organismes de Maintenance des Aeronefs
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-anac-border overflow-hidden">
          <div className="h-[3px] bg-gradient-to-r from-anac-navy via-anac-blue to-anac-sky" />

          <div className="p-6">
            <div className="flex gap-2 mb-5">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${
                  mode === 'login'
                    ? 'border-anac-navy bg-anac-navy text-white'
                    : 'border-anac-border text-anac-muted'
                }`}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => setMode('request')}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${
                  mode === 'request'
                    ? 'border-anac-navy bg-anac-navy text-white'
                    : 'border-anac-border text-anac-muted'
                }`}
              >
                Demander un compte
              </button>
            </div>

            {mode === 'login' ? (
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <FormField id={emailId} label="Email" error={errors.email?.message}>
                  <Input
                    id={emailId}
                    {...form.register('email')}
                    type="email"
                    autoFocus
                    autoComplete="email"
                    aria-invalid={!!errors.email}
                    className={errCls(!!errors.email)}
                  />
                </FormField>

                <FormField id={passwordId} label="Mot de passe" error={errors.password?.message}>
                  <div className="relative">
                    <Input
                      id={passwordId}
                      {...form.register('password')}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      aria-invalid={!!errors.password}
                      className={`${errCls(!!errors.password)} pr-10`}
                    />
                    <EyeToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                  </div>
                </FormField>

                <ServerError message={serverError} />

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Connexion...
                    </>
                  ) : (
                    'Se connecter'
                  )}
                </Button>
              </form>
            ) : (
              <form
                onSubmit={requestForm.handleSubmit(onRequestSubmit)}
                className="space-y-3"
                noValidate
              >
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  className="hidden"
                  {...requestForm.register('honeypot')}
                />

                <FormField
                  id="organisationNameInput"
                  label="Organisme"
                  error={requestErrors.organisationNameInput?.message}
                >
                  <Input
                    {...requestForm.register('organisationNameInput')}
                    className={errCls(!!requestErrors.organisationNameInput)}
                  />
                </FormField>

                <FormField
                  id="legalAddress"
                  label="Adresse legale"
                  error={requestErrors.legalAddress?.message}
                >
                  <Input
                    {...requestForm.register('legalAddress')}
                    className={errCls(!!requestErrors.legalAddress)}
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    id="requestedEmail"
                    label="Email organisme"
                    error={requestErrors.requestedEmail?.message}
                  >
                    <Input
                      type="email"
                      {...requestForm.register('requestedEmail')}
                      className={errCls(!!requestErrors.requestedEmail)}
                    />
                  </FormField>
                  <FormField id="phone" label="Telephone" error={requestErrors.phone?.message}>
                    <Input {...requestForm.register('phone')} />
                  </FormField>
                </div>

                <FormField
                  id="originalApprovalNumber"
                  label="Numero d'agrement existant"
                  error={requestErrors.originalApprovalNumber?.message}
                >
                  <Input {...requestForm.register('originalApprovalNumber')} />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    id="contactFullName"
                    label="Nom du contact"
                    error={requestErrors.contactFullName?.message}
                  >
                    <Input
                      {...requestForm.register('contactFullName')}
                      className={errCls(!!requestErrors.contactFullName)}
                    />
                  </FormField>
                  <FormField
                    id="contactPhone"
                    label="Telephone contact"
                    error={requestErrors.contactPhone?.message}
                  >
                    <Input {...requestForm.register('contactPhone')} />
                  </FormField>
                </div>

                <FormField
                  id="contactEmail"
                  label="Email de connexion"
                  error={requestErrors.contactEmail?.message}
                >
                  <Input
                    type="email"
                    {...requestForm.register('contactEmail')}
                    className={errCls(!!requestErrors.contactEmail)}
                  />
                </FormField>

                <FormField
                  id="requestPassword"
                  label="Mot de passe"
                  error={requestErrors.password?.message}
                >
                  <Input
                    type="password"
                    {...requestForm.register('password')}
                    className={errCls(!!requestErrors.password)}
                  />
                </FormField>

                {requestError && <p className="text-anac-danger text-xs">{requestError}</p>}
                {requestSuccess && <p className="text-anac-success text-xs">{requestSuccess}</p>}

                <Button type="submit" className="w-full" disabled={requestSubmitting}>
                  {requestSubmitting ? 'Envoi...' : 'Envoyer la demande'}
                </Button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-anac-muted text-[10px] mt-4 tracking-wide uppercase">
          ANAC Gabon
        </p>
      </motion.div>
    </div>
  );
}
