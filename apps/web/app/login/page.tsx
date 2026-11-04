"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter(); const search = useSearchParams();
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    const result = await signIn("credentials", { email: form.get("email"), password: form.get("password"), redirect: false });
    setLoading(false);
    if (result?.error) { setError("E-mail ou senha inválidos, ou acesso temporariamente limitado."); return; }
    router.replace(search.get("callbackUrl") || "/divulgado"); router.refresh();
  }
  return <main className={styles.shell}><section className={styles.card}><div className={styles.brand}><span>M</span><div><b>MONSTRO</b><small>ACESSO PRIVADO</small></div></div><h1>Bem-vindo de volta</h1><p>Entre com a conta administrativa autorizada.</p><form onSubmit={submit}><label>E-mail<input name="email" type="email" autoComplete="username" required/></label><label>Senha<input name="password" type="password" autoComplete="current-password" minLength={8} required/></label>{error && <div role="alert" className={styles.error}>{error}</div>}<button disabled={loading}>{loading ? "Verificando…" : "Entrar com segurança"}</button></form><small className={styles.help}>A recuperação de acesso é feita pelo administrador da implantação, sem envio de senhas por e-mail.</small></section></main>;
}
