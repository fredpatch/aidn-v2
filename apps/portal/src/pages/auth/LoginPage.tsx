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

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { refreshMe } = useApplicantAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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

  const { errors, isSubmitting } = form.formState;
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
            <p className="text-[13px] font-semibold text-anac-navy mb-5">
              Connectez-vous a votre espace
            </p>

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

            <p className="text-anac-muted text-[11px] text-center mt-4">
              Pas encore de compte ? La demande de creation de compte sera disponible prochainement.
            </p>
          </div>
        </div>

        <p className="text-center text-anac-muted text-[10px] mt-4 tracking-wide uppercase">
          ANAC Gabon
        </p>
      </motion.div>
    </div>
  );
}
