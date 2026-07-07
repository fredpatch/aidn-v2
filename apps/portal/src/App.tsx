import { Routes, Route } from "react-router-dom";

function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="card">
        <h1 className="text-anac-navy text-xl font-semibold">AIDN - Portail Postulant</h1>
        <p className="text-anac-muted mt-2">
          Scaffold ready. Pages are added sprint by sprint - see docs/TASKS.md.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
    </Routes>
  );
}
