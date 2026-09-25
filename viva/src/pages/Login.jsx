import { useState } from "react";
import {
    ArrowRight,
    ShieldCheck,
    Boxes,
    MapPin,
    Activity,
    Eye,
    EyeOff,
} from "lucide-react";
import { useApp } from "../lib/context";
import { message } from "../lib/api";
import { Field, Submit } from "../components/ui";
export default function Login() {
    const { login, authError, online } = useApp(),
        [error, setError] = useState(""),
        [busy, setBusy] = useState(false),
        [show, setShow] = useState(false);
    async function submit(e) {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
            await login(data.get("email"), data.get("password"));
        } catch (err) {
            setError(message(err));
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
            <section className="relative hidden overflow-hidden bg-brand-900 p-14 text-white lg:flex lg:flex-col">
                <div className="flex items-center gap-3">
                    <img src="/viva.png" className="w-32 object-contain" alt="" />
                </div>
                <div className="relative z-10 my-auto max-w-lg py-20">
                    <p className="mb-6 text-xs font-medium uppercase tracking-[.22em] text-emerald-200/70">
                        ONE COMPANY. EVERY LOCATION.
                    </p>
                    <h1 className="text-[52px] font-semibold leading-[1.12] tracking-[-2px]">
                        Your operations.
                        <br />
                        Working together.
                    </h1>
                    <p className="mt-7 max-w-md text-base leading-7 text-emerald-100/65">
                        From the warehouse floor to the boardroom. A clear view of your
                        stock, spending, and business across Nigeria.
                    </p>
                    <div className="mt-12 grid grid-cols-3 gap-5 border-t border-white/15 pt-7">
                        {[
                            [Boxes, "Inventory control"],
                            [MapPin, "Every location"],
                            [Activity, "Real-time insights"],
                        ].map(([Icon, label]) => (
                            <div key={label}>
                                <Icon
                                    size={22}
                                    strokeWidth={1.4}
                                    className="text-emerald-200"
                                />
                                <p className="mt-3 text-xs text-emerald-100/75">{label}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <p className="text-xs text-emerald-100/40">
                    Built for the way your business moves.
                </p>
                <div className="pointer-events-none absolute -bottom-48 -right-48 h-[550px] w-[550px] rounded-full border-[70px] border-white/[.025]" />
            </section>
            <section className="flex flex-col justify-between px-7 py-10 sm:px-16">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 lg:invisible">
                        <img src="/viva.svg" alt="Viva" className="h-8 w-8" />
                        <span className="text-xl font-bold text-brand-900">viva.</span>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                        <ShieldCheck size={15} />
                        Secure sign in
                    </span>
                </div>
                <div className="mx-auto w-full max-w-[380px] py-14">
                    <p className="eyebrow mb-3">WELCOME TO VIVA</p>
                    <h2 className="text-3xl font-semibold tracking-[-1px] text-slate-900">
                        Welcome back.
                    </h2>
                    <p className="mb-9 mt-3 text-sm text-slate-500">
                        Sign in to your company workspace.
                    </p>
                    <form onSubmit={submit} className="space-y-5">
                        <Field label="Work email" required>
                            <input
                                name="email"
                                type="email"
                                autoComplete="username"
                                placeholder="you@company.com"
                                required
                            />
                        </Field>
                        <Field label="Password" required>
                            <div className="relative">
                                <input
                                    className="pr-12"
                                    name="password"
                                    type={show ? "text" : "password"}
                                    autoComplete="current-password"
                                    placeholder="Enter your password"
                                    required
                                />
                                <button
                                    type="button"
                                    aria-label={show ? "Hide password" : "Show password"}
                                    className="icon-btn absolute right-1 top-1"
                                    onClick={() => setShow(!show)}
                                >
                                    {show ? <EyeOff size={17} /> : <Eye size={17} />}
                                </button>
                            </div>
                        </Field>
                        {(error || authError || !online) && (
                            <p
                                role="alert"
                                className="rounded-lg bg-red-50 p-3 text-xs text-red-700"
                            >
                                {error ||
                                    authError ||
                                    "Connect to the internet to sign in securely."}
                            </p>
                        )}
                        <div className="pt-2 [&>button]:w-full">
                            <Submit busy={busy || !online}>
                                Sign in to Viva <ArrowRight size={16} />
                            </Submit>
                        </div>
                    </form>
                    <p className="mt-7 text-center text-xs leading-6 text-slate-400">
                        Need an account or help signing in?
                        <br />
                        Contact your company administrator.
                    </p>
                </div>
                <p className="text-center text-[11px] text-slate-400">
                    Viva Business Management · Your company, connected.
                </p>
            </section>
        </div>
    );
}
