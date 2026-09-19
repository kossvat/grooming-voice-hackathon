import "./globals.css";

export const metadata = {
  title: "Grooming Voice — Pet Grooming Reception",
  description: "AI voice receptionist for pet grooming appointments",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
