export const metadata = { title: 'EHR Jev - Cartella Clinica', description: 'Demo estrazione parametri con TypeSafe Jev via Vercel AI Gateway' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it"><body style={{margin:0, fontFamily:'Inter, system-ui, sans-serif', background:'#f8fafc'}}>{children}</body></html>
  );
}
