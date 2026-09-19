export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Grooming Voice</h1>
      <p>
        Voice receptionist for a fictional Miami dog grooming studio.
      </p>
      <ul>
        <li>
          <a href="/demo">/demo — customer voice booking</a>
        </li>
        <li>
          <a href="/studio">/studio — staff calendar (protected)</a>
        </li>
      </ul>
    </main>
  );
}
