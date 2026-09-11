# Water Quality Monitoring — Dashboard MONITORING (Frontend)

Frontend **Next.js 14 + TypeScript + TailwindCSS + Plotly.js** du
dashboard de monitoring intelligent de la qualité des eaux usées
traitées. Consomme exclusivement le service `monitoring_backend`
(FastAPI, port 8001 par défaut) — jamais l'API stockage directement.

## 1. Installation

```bash
cd monitoring_frontend
npm install
```

## 2. Configuration

Créer un fichier `.env.local` (optionnel, valeurs par défaut déjà
correctes en développement local) :

```
NEXT_PUBLIC_MONITORING_API_URL=http://localhost:8001
NEXT_PUBLIC_MONITORING_WS_URL=ws://localhost:8001/ws/live
```

## 3. Lancement

```bash
npm run dev
```

Dashboard disponible sur http://localhost:3001

**Prérequis** : le service `monitoring_backend` (port 8001) doit tourner,
lui-même connecté au backend stockage (port 8000). Sans eux, les pages
affichent un état "Erreur de connexion à l'API monitoring" plutôt que de
planter.

## 4. Pages du dashboard

| Route            | Contenu                                                             |
|-------------------|----------------------------------------------------------------------|
| `/`                | Monitoring temps réel + historique, cartes de conformité, flux WebSocket |
| `/statistiques`    | Statistiques globales (min/max/moyenne/écart-type/quartiles)         |
| `/analyse`          | Analyse scientifique : histogrammes, corrélations (heatmap), boxplots, timeline |
| `/comparaison`       | SET 1 vs SET 2 (+ dérive KS-test) et IN vs OUT_CONTROL vs OUT_PLANT (ANOVA+Tukey, removal %) |
| `/alertes`            | Anomalies intelligentes (Z-score/Isolation Forest/Autoencoder) + captures nulles consécutives |
| `/journal`             | Calendrier des jours avec alerte (rouge = alerte), détail au clic     |
| `/qualite`              | Taux de conformité aux normes + rapport de qualité des données        |
| `/etudes`                | Études, cycles de laboratoire (formulaire 24 lignes + import Excel)   |
| `/donnees`                | Tableau complet des mesures + export CSV (tout ou période précise)    |

## 5. Notes techniques

- **Plotly.js** est chargé via `plotly.js-dist-min` (bundle navigateur
  pré-compilé) plutôt que le paquet `plotly.js` complet, pour éviter les
  soucis de résolution de modules Node (`buffer/`, etc.) par le bundler
  de Next.js. Voir `components/PlotlyChart.tsx`.
- **Export PNG** : chaque graphe du monitoring temps réel a un bouton de
  téléchargement PNG (`Plotly.downloadImage`) et un bouton CSV/Excel
  (les fichiers CSV s'ouvrent nativement dans Excel).
- **Flux temps réel** : `hooks/useLiveSocket.ts` se connecte à
  `/ws/live` avec reconnexion automatique (5s) si le service monitoring
  redémarre.
- **Design** : palette sombre "salle de contrôle" (teal/aqua sur fond
  slate profond), typographie mono pour les valeurs numériques —
  volontairement différente d'un template SaaS générique.

## 6. Build production

```bash
npm run build
npm run start   # sert sur le port 3001
```
