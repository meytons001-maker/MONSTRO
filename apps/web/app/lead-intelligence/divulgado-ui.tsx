"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./lead-intelligence.module.css";

type IconName = "overview" | "search" | "portfolio" | "funnel" | "agenda" | "lists" | "sparkles" | "close" | "reset" | "download";

const paths: Record<IconName, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  portfolio: <><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></>,
  funnel: <path d="M4 5h16l-6 7v5l-4 2v-7Z"/>,
  agenda: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 10h18m-13 4h3m2 0h3m-8 3h3"/></>,
  lists: <><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,
  sparkles: <><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8Zm14-2 .8 2.2L22 15l-2.2.8L19 18l-.8-2.2L16 15l2.2-.8Z"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  reset: <><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v6h6"/></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 19h14"/></>,
};

export function Icon({ name }: { name: IconName }) {
  return <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function ActionButton({ icon, tone = "neutral", children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName; tone?: "primary" | "neutral" | "danger" | "success" }) {
  return <button {...props} className={`${styles.actionButton} ${styles[`tone_${tone}`]} ${className}`}><span className={styles.buttonContent}>{icon && <Icon name={icon}/>}<span>{children}</span></span></button>;
}

export function NavItem({ icon, title, description, active, onClick, href }: { icon: IconName; title: string; description: string; active?: boolean; onClick?: () => void; href?: string }) {
  const content = <><span className={styles.navIcon}><Icon name={icon}/></span><span><b>{title}</b><small>{description}</small></span></>;
  if (href) return <a className={active ? styles.activeTab : ""} href={href}>{content}</a>;
  return <button type="button" className={active ? styles.activeTab : ""} onClick={onClick} aria-current={active ? "page" : undefined}>{content}</button>;
}

export function Field({ label, icon, className = "", children }: { label: string; icon?: IconName; className?: string; children: ReactNode }) {
  return <label className={className}><span className={styles.fieldLabel}>{icon && <Icon name={icon}/>} {label}</span>{children}</label>;
}

