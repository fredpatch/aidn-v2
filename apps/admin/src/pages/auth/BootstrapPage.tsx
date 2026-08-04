import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Loader2, Settings2, CheckCircle2, AlertTriangle } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { apiErrorMessage } from '../../lib/axios';
import { bootstrapInit } from '../../lib/api/auth.api';
import { useAuth } from '../../hooks/useAuth';

import { fadeUp } from './animations';
import { GridPattern, FormField, EyeToggle, ServerError, PasswordStrength } from './components';

const bootstrapSchema = z
  .object({
    employeeCode: z.string().min(1, 'Le matricule est requis'),
    fullName: z.string().min(1, 'Le nom complet est requis'),
    email: z.string().min(1, "L'email est requis").email('Adresse email invalide'),
    password: z
      .string()
      .min(8, 'Minimum 8 caracteres')
      .regex(/[A-Z]/, 'Au moins une majuscule')
      .regex(/[0-9]/, 'Au moins un chiffre')
      .regex(/[^A-Za-z0-9]/, 'Au moins un caractere special'),
    confirmation: z.string().min(1, 'La confirmation est requise'),
  })
  .refine((d) => d.password === d.confirmation, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmation'],
  });

type BootstrapFormData = z.infer<typeof bootstrapSchema>;

export default function BootstrapPage() {
  const { refreshBootstrapStatus } = useAuth();

  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const employeeCodeId = useId();
  const fullNameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();

  const form = useForm<BootstrapFormData>({
    resolver: zodResolver(bootstrapSchema),
    defaultValues: { employeeCode: '', fullName: '', email: '', password: '', confirmation: '' },
    mode: 'onBlur',
  });

  const { errors, isSubmitting } = form.formState;
  const watchedPassword = form.watch('password');

  async function onSubmit(data: BootstrapFormData) {
    setServerError(null);
    try {
      await bootstrapInit(data);
      setSuccess(true);
      await refreshBootstrapStatus();
    } catch (err) {
      setServerError(apiErrorMessage(err, "Erreur lors de l'initialisation. Veuillez reessayer."));
    }
  }

  const errCls = (has: boolean) => (has ? 'border-anac-danger focus:ring-red-300' : '');

  if (success) {
    const { employeeCode, email, fullName } = form.getValues();
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
          <div className="bg-white rounded-2xl shadow-sm border border-anac-border overflow-hidden">
            <div className="h-[3px] bg-gradient-to-r from-anac-navy via-anac-blue to-anac-sky" />
            <div className="p-8 text-center space-y-5">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 340, damping: 22, delay: 0.1 }}
                className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-emerald-50 border border-emerald-200 mx-auto"
              >
                <CheckCircle2 size={26} className="text-emerald-600" />
              </motion.div>

              <div>
                <h2 className="text-[15px] font-bold text-anac-navy">Super Admin cree</h2>
                <p className="text-anac-muted text-[11px] mt-1 leading-relaxed">
                  Vous pouvez maintenant vous connecter avec ces identifiants.
                </p>
              </div>

              <div className="bg-anac-gray rounded-lg px-4 py-3 text-left space-y-1.5">
                <p className="text-[11px] text-anac-text">
                  <span className="font-semibold text-anac-navy">Titulaire :</span> {fullName}
                </p>
                <p className="text-[11px] text-anac-text">
                  <span className="font-semibold text-anac-navy">Matricule :</span> {employeeCode}
                </p>
                <p className="text-[11px] text-anac-text">
                  <span className="font-semibold text-anac-navy">Email :</span> {email}
                </p>
              </div>

              <Button className="w-full" onClick={() => window.location.reload()}>
                Aller a la connexion
              </Button>
            </div>
          </div>
          <p className="text-center text-anac-muted text-[10px] mt-4 tracking-wide uppercase">
            ANAC Gabon - Usage interne uniquement
          </p>
        </motion.div>
      </div>
    );
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
            <Settings2 className="text-white relative z-10" size={22} strokeWidth={1.75} />
          </motion.div>
          <h1 className="text-xl font-bold text-anac-navy tracking-tight">AIDN</h1>
          <p className="text-anac-muted text-[11px] mt-0.5 leading-relaxed">
            Application Informatique de la Direction de la Navigabilite
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-anac-border overflow-hidden">
          <div className="h-[3px] bg-gradient-to-r from-anac-navy via-anac-blue to-anac-sky" />

          <div className="px-6 pt-5">
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-3">
              <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-amber-800 font-semibold text-[11px]">
                  Initialisation d&apos;AIDN
                </p>
                <p className="text-amber-700 text-[11px] mt-0.5 leading-relaxed">
                  Aucun compte administrateur n&apos;existe encore. Creez le premier Super Admin.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <FormField
                id={employeeCodeId}
                label="Matricule"
                error={errors.employeeCode?.message}
                required
              >
                <Input
                  id={employeeCodeId}
                  {...form.register('employeeCode')}
                  placeholder="Ex : SU-2026-001"
                  autoFocus
                  autoComplete="username"
                  spellCheck={false}
                  aria-invalid={!!errors.employeeCode}
                  className={errCls(!!errors.employeeCode)}
                />
              </FormField>

              <FormField
                id={fullNameId}
                label="Nom complet"
                error={errors.fullName?.message}
                required
              >
                <Input
                  id={fullNameId}
                  {...form.register('fullName')}
                  autoComplete="name"
                  aria-invalid={!!errors.fullName}
                  className={errCls(!!errors.fullName)}
                />
              </FormField>

              <FormField id={emailId} label="Email" error={errors.email?.message} required>
                <Input
                  id={emailId}
                  {...form.register('email')}
                  type="email"
                  inputMode="email"
                  placeholder="prenom.nom@anac.ga"
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  className={errCls(!!errors.email)}
                />
              </FormField>

              <FormField
                id={passwordId}
                label="Mot de passe"
                error={errors.password?.message}
                required
              >
                <div className="relative">
                  <Input
                    id={passwordId}
                    {...form.register('password')}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimum 8 caracteres"
                    autoComplete="new-password"
                    aria-invalid={!!errors.password}
                    className={cn(errCls(!!errors.password), 'pr-10')}
                  />
                  <EyeToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                </div>
              </FormField>

              {watchedPassword && <PasswordStrength password={watchedPassword} />}

              <FormField
                id={confirmId}
                label="Confirmation"
                error={errors.confirmation?.message}
                required
              >
                <div className="relative">
                  <Input
                    id={confirmId}
                    {...form.register('confirmation')}
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    aria-invalid={!!errors.confirmation}
                    className={cn(errCls(!!errors.confirmation), 'pr-10')}
                  />
                  <EyeToggle show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
                </div>
              </FormField>

              <ServerError message={serverError} />

              <Button type="submit" className="w-full mt-2" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Creation...
                  </>
                ) : (
                  'Creer le Super Admin'
                )}
              </Button>
            </form>
          </div>
        </div>

        <p className="text-center text-anac-muted text-[10px] mt-4 tracking-wide uppercase">
          ANAC Gabon - Usage interne uniquement
        </p>
      </motion.div>
    </div>
  );
}
