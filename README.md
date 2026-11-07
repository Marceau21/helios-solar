# Helios — supervision solaire en 3D

Plateforme SaaS pour **installateurs solaires** et **particuliers** : la maison du client est reconstruite en 3D depuis son adresse, et la production, la consommation, la batterie et les échanges avec le réseau mesurés par l'onduleur s'y affichent en direct.

> Nom de travail « Helios » : à remplacer librement (`package.json`, `layout.tsx`).

## Démarrer en 2 minutes (mode démo, aucune clé)

```bash
npm install
cp .env.example .env.local
npm run dev
```

Ouvrir http://localhost:3000. Le mode démo affiche 4 installations fictives avec des données simulées, **toujours étiquetées « Démo »**.

- `/` — page d'accueil avec la maison 3D en direct
- `/installer` — portefeuille de l'installateur (production de chaque client, alertes)
- `/installer/new` — nouveau client : adresse → maison 3D → pose des panneaux
- `/installer/[id]` — supervision, édition du toit/panneaux, équipements
- `/home` — espace particulier

## Architecture

```
Next.js (App Router, TypeScript, Tailwind)
├── Interface      src/app, src/components        espaces installateur et particulier
├── Moteur 3D      src/components/three           React Three Fiber : murs, pans de toit, panneaux, flux animés
├── Géométrie      src/lib/solar/geometry.ts      repère local, grilles de panneaux, implantation auto
├── Google Solar   src/lib/solar/google.ts        adresse → GPS → segments de toit → modèle 3D
├── Connecteurs    src/lib/connectors/            SolarEdge, Enphase, Démo → format commun
├── Données        src/lib/data.ts                mémoire (démo) ou Supabase + RLS
└── Sync planifiée src/app/api/cron/sync          historise les mesures (Vercel Cron, 5 min)
Supabase (PostgreSQL + Auth)  supabase/migrations/0001_init.sql
```

**Choix volontaires par rapport au plan initial** : pas de backend NestJS séparé pour le MVP (les routes API Next.js suffisent et un seul déploiement est plus simple à maintenir seul) ; polling adapté aux quotas fabricants au lieu de WebSockets (SolarEdge : 300 requêtes/jour/site, Enphase : intervalles de 15 min). Les deux pourront être ajoutés quand le volume le justifiera.

### Format de données commun

Tous les connecteurs renvoient `PowerSnapshot` (W) et `EnergyDay` (kWh) — voir `src/types/energy.ts`. Une grandeur non mesurée par le matériel vaut `null` et s'affiche « — » : on n'invente jamais une valeur. Chaque mesure porte sa date, sa source et un indicateur de fraîcheur (en direct / récent / ancien / hors ligne).

### Ajouter un fabricant (Sungrow, SMA…)

1. Créer `src/lib/connectors/sungrow.ts` qui implémente l'interface `Connector`.
2. Ajouter un `case` dans `src/lib/connectors/index.ts`.

## Passer en production

### 1. Supabase
1. Créer un projet sur supabase.com.
2. SQL Editor → coller et exécuter `supabase/migrations/0001_init.sql`.
3. Renseigner `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Créer un utilisateur (Authentication), une ligne dans `companies`, puis dans `profiles` (`role = installer_admin`, `company_id`).
5. Mettre `NEXT_PUBLIC_DEMO_MODE=false`.

### 2. Google Solar API
Console Google Cloud → activer **Solar API** et **Geocoding API** → créer une clé restreinte à ces deux API → `GOOGLE_MAPS_API_KEY`. Sans données pour une adresse, l'app crée une maison générique que l'installateur corrige.

### 3. Onduleurs
- **SolarEdge** : l'installateur génère une clé API du site dans le portail SolarEdge (Admin → Accès site). La stocker chiffrée dans `vendor_connections` (`external_site_id` = siteId).
- **Enphase** : créer une app sur developer-v4.enphase.com → `ENPHASE_CLIENT_ID/SECRET/API_KEY`. Le particulier autorise l'accès via OAuth (`enphaseAuthorizeUrl`). Les jetons sont rafraîchis automatiquement.
- Générer `CREDENTIALS_ENCRYPTION_KEY` (voir `.env.example`). Les secrets sont chiffrés en AES-256-GCM et ne sont jamais envoyés au navigateur.
- `customer_consent_at` doit être renseigné : sans consentement du client, aucune donnée n'est récupérée.

> ⚠️ Les champs exacts de certains endpoints Enphase (`*_lifetime`, `telemetry/battery`) dépendent du plan d'API souscrit : à valider sur un compte développeur réel avant le pilote.

### 4. Déploiement
Vercel → importer le repo → ajouter les variables d'environnement + `CRON_SECRET`. Le cron de `vercel.json` appelle `/api/cron/sync` toutes les 5 minutes.

## Prochaines étapes

1. Un pilote : une vraie maison + un onduleur SolarEdge de ton patron.
2. Écran de connexion d'un onduleur dans l'espace installateur (formulaire clé SolarEdge + bouton OAuth Enphase).
3. Invitation du particulier par e-mail (Supabase Auth) et liaison `customers.user_id`.
4. Alertes persistées (table `alerts`) + notifications e-mail.
5. Connecteurs Sungrow et SMA.

## Limites connues

- En mode démo, les clients créés sont gardés en mémoire du serveur et disparaissent au redémarrage.
- Le modèle 3D est une représentation simplifiée (murs + pans de toit), pas une maquette photoréaliste.
- La consommation n'est disponible que si l'installation possède un compteur ou des pinces de mesure.
