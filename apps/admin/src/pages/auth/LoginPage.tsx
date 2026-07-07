import { useId, useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ShieldCheck } from "lucide-react";

import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { api, apiErrorMessage } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";

import { slideVariants, slideTx, fadeUp } from "./animations";
import { GridPattern, StepTab, ModeTab, FormField, EyeToggle, ServerError, PasswordStrength } from "./components";

const loginSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("otp"),
    employeeCode: z.string().min(1, "Le matricule est requis"),
    otp: z.string().length(6, "Le code OTP doit contenir exactement 6 chiffres").regex(/^\d+$/, "Uniquement des chiffres"),
    password: z.string().optional(),
  }),
  z.object({
    mode: z.literal("password"),
    employeeCode: z.string().min(1, "Le matricule est requis"),
    password: z.string().min(1, "Le mot de passe est requis"),
    otp: z.string().optional(),
  }),
]);

const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Minimum 8 caracteres")
      .regex(/[A-Z]/, "Au moins une majuscule")
      .regex(/[0-9]/, "Au moins un chiffre")
      .regex(/[^A-Za-z0-9]/, "Au moins un caractere special"),
    confirmation: z.string().min(1, "La confirmation est requise"),
  })
  .refine((d) => d.password === d.confirmation, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmation"],
  });

type LoginFormData = z.infer<typeof loginSchema>;
type SetPasswordFormData = z.infer<typeof setPasswordSchema>;
type Step = "login" | "set-password";

export default function LoginPage() {
  const { refreshMe } = useAuth();

  const [step, setStep] = useState<Step>("login");
  const [direction, setDirection] = useState(1);
  const [firstLogin, setFirstLogin] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const employeeCodeId = useId();
  const otpId = useId();
  const passwordId = useId();
  const newPassId = useId();
  const confirmId = useId();

  useEffect(() => {
    if (sessionStorage.getItem("session_expiree")) {
      sessionStorage.removeItem("session_expiree");
      setServerError("Votre session a expire. Veuillez vous reconnecter.");
    }
  }, []);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { mode: "password", employeeCode: "", password: "", otp: "" },
  });

  const passwordForm = useForm<SetPasswordFormData>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: "", confirmation: "" },
    mode: "onChange",
  });

  const watchedPassword = passwordForm.watch("password");

  function toggleMode(isFirstLogin: boolean) {
    setFirstLogin(isFirstLogin);
    setServerError(null);
    loginForm.clearErrors();
    loginForm.reset({
      mode: isFirstLogin ? "otp" : "password",
      employeeCode: loginForm.getValues("employeeCode"),
      password: "",
      otp: "",
    });
  }

  async function onLoginSubmit(data: LoginFormData) {
    setServerError(null);
    try {
      const { data: result } = await api.post("/auth/login", {
        employeeCode: data.employeeCode,
        ...(data.mode === "otp" ? { otp: data.otp } : { password: data.password }),
      });

      if (result.firstLogin) {
        setDirection(1);
        setStep("set-password");
      } else {
        await refreshMe();
      }
    } catch (err) {
      setServerError(apiErrorMessage(err, "Identifiants invalides. Veuillez reessayer."));
    }
  }

  async function onSetPasswordSubmit(data: SetPasswordFormData) {
    setServerError(null);
    try {
      await api.post("/auth/set-password", { password: data.password, confirmation: data.confirmation });
      await refreshMe();
    } catch (err) {
      setServerError(apiErrorMessage(err, "Erreur lors de la definition du mot de passe."));
    }
  }

  function backToLogin() {
    setDirection(-1);
    setStep("login");
    setServerError(null);
    passwordForm.reset();
  }

  const errCls = (has: boolean) => (has ? "border-anac-danger focus:ring-red-300" : "");
  const loginErrors = loginForm.formState.errors;

  return (
    <div className="min-h-dvh bg-anac-gray flex items-center justify-center p-4 relative overflow-hidden">
      <GridPattern />

      <motion.div
        className="w-full max-w-[420px] relative z-10"
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="text-center mb-7">
          <motion.div
            className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-anac-navy shadow-lg mb-4 relative overflow-hidden"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-anac-blue/40 to-transparent" />
            <ShieldCheck className="text-white relative z-10" size={24} strokeWidth={1.75} />
          </motion.div>
          <h1 className="text-xl font-bold text-anac-navy tracking-tight">AIDN</h1>
          <p className="text-anac-muted text-[11px] mt-0.5 leading-relaxed">
            Direction de la Navigabilite - ANAC Gabon
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-anac-border overflow-hidden">
          <div className="h-[3px] bg-gradient-to-r from-anac-navy via-anac-blue to-anac-sky" />

          <div className="flex border-b border-anac-border">
            <StepTab active={step === "login"} completed={step === "set-password"} step={1} label="Connexion" />
            <div className="w-px bg-anac-border" />
            <StepTab active={step === "set-password"} completed={false} step={2} label="Mot de passe" />
          </div>

          <div className="p-6 overflow-hidden">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              {step === "login" && (
                <motion.div key="login" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={slideTx}>
                  <p className="text-[13px] font-semibold text-anac-navy mb-5">Connectez-vous a votre espace</p>

                  <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4" noValidate>
                    <FormField id={employeeCodeId} label="Matricule" error={loginErrors.employeeCode?.message}>
                      <Input
                        id={employeeCodeId}
                        {...loginForm.register("employeeCode")}
                        placeholder="Ex : SU-2026-001"
                        autoFocus
                        autoComplete="username"
                        spellCheck={false}
                        aria-invalid={!!loginErrors.employeeCode}
                        className={errCls(!!loginErrors.employeeCode)}
                      />
                    </FormField>

                    <div className="grid grid-cols-2 rounded-lg border border-anac-border overflow-hidden" role="group" aria-label="Mode de connexion">
                      <ModeTab active={!firstLogin} onClick={() => toggleMode(false)} label="Mot de passe" />
                      <ModeTab active={firstLogin} onClick={() => toggleMode(true)} label="Premiere connexion (OTP)" />
                    </div>

                    <AnimatePresence mode="wait" initial={false}>
                      {firstLogin ? (
                        <motion.div key="otp" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                          <FormField
                            id={otpId}
                            label="Code OTP"
                            hint="Code a 6 chiffres recu par e-mail"
                            error={"otp" in loginErrors ? (loginErrors as { otp?: { message?: string } }).otp?.message : undefined}
                          >
                            <Input
                              id={otpId}
                              {...loginForm.register("otp")}
                              type="text"
                              inputMode="numeric"
                              placeholder="000000"
                              maxLength={6}
                              autoComplete="one-time-code"
                              className={cn(errCls("otp" in loginErrors), "tracking-[0.4em] text-center text-base font-bold")}
                              onChange={(e) =>
                                loginForm.setValue("otp", e.target.value.replace(/\D/g, "").slice(0, 6), { shouldValidate: true })
                              }
                            />
                          </FormField>
                        </motion.div>
                      ) : (
                        <motion.div key="pwd" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                          <FormField
                            id={passwordId}
                            label="Mot de passe"
                            error={"password" in loginErrors ? (loginErrors as { password?: { message?: string } }).password?.message : undefined}
                          >
                            <div className="relative">
                              <Input
                                id={passwordId}
                                {...loginForm.register("password")}
                                type={showPassword ? "text" : "password"}
                                autoComplete="current-password"
                                className={cn(errCls("password" in loginErrors), "pr-10")}
                              />
                              <EyeToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                            </div>
                          </FormField>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <ServerError message={serverError} />

                    <Button type="submit" className="w-full" disabled={loginForm.formState.isSubmitting}>
                      {loginForm.formState.isSubmitting ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Connexion...
                        </>
                      ) : (
                        "Se connecter"
                      )}
                    </Button>
                  </form>
                </motion.div>
              )}

              {step === "set-password" && (
                <motion.div key="set-password" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={slideTx}>
                  <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-3.5 py-3 mb-5">
                    <ShieldCheck size={14} className="text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-blue-800 text-[11px] leading-relaxed">
                      Code verifie. Choisissez votre mot de passe pour finaliser votre premiere connexion.
                    </p>
                  </div>

                  <form onSubmit={passwordForm.handleSubmit(onSetPasswordSubmit)} className="space-y-4" noValidate>
                    <FormField id={newPassId} label="Nouveau mot de passe" error={passwordForm.formState.errors.password?.message}>
                      <div className="relative">
                        <Input
                          id={newPassId}
                          {...passwordForm.register("password")}
                          type={showNew ? "text" : "password"}
                          placeholder="Minimum 8 caracteres"
                          autoComplete="new-password"
                          autoFocus
                          className={cn(errCls(!!passwordForm.formState.errors.password), "pr-10")}
                        />
                        <EyeToggle show={showNew} onToggle={() => setShowNew((v) => !v)} />
                      </div>
                    </FormField>

                    {watchedPassword && <PasswordStrength password={watchedPassword} />}

                    <FormField id={confirmId} label="Confirmation" error={passwordForm.formState.errors.confirmation?.message}>
                      <div className="relative">
                        <Input
                          id={confirmId}
                          {...passwordForm.register("confirmation")}
                          type={showConfirm ? "text" : "password"}
                          autoComplete="new-password"
                          className={cn(errCls(!!passwordForm.formState.errors.confirmation), "pr-10")}
                        />
                        <EyeToggle show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
                      </div>
                    </FormField>

                    <ServerError message={serverError} />

                    <div className="flex gap-2.5 pt-1">
                      <Button type="button" variant="secondary" className="flex-1" onClick={backToLogin} disabled={passwordForm.formState.isSubmitting}>
                        Retour
                      </Button>
                      <Button type="submit" className="flex-1" disabled={passwordForm.formState.isSubmitting}>
                        {passwordForm.formState.isSubmitting ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Enregistrement...
                          </>
                        ) : (
                          "Definir mon mot de passe"
                        )}
                      </Button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <p className="text-center text-anac-muted text-[10px] mt-4 tracking-wide uppercase">
          ANAC Gabon - Usage interne uniquement
        </p>
      </motion.div>
    </div>
  );
}
