// Sur le plan, chaque domaine est une salle de l'étage. Un domaine inconnu garde simplement son nom.

const ROOMS: Record<string, string> = {
  gameplay: "Foyer",
  profs: "Salle des profs",
  "3d": "Atelier 3D",
  son: "Studio son",
  code: "Salle machines",
  ui: "Hall",
  orga: "Scolarité",
};

export const roomOf = (domain: string): string => ROOMS[domain] ?? domain;
