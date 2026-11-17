# MediVision AI – Explainable AI for Medical Imaging

AI-powered medical image classification and explainable AI platform.

MediVision AI is a web-based decision-support platform that helps healthcare professionals review medical images. Users upload an X-ray, CT or MRI image, a Google Gemini vision model classifies it, and the app shows findings, confidence scores, an attention overlay and a printable report.

> **Important:** MediVision AI is an AI-assisted decision-support system, not a certified medical diagnostic device. All results must be reviewed by a qualified healthcare professional.

## Key features

- Secure registration and login
- Dashboard with scan activity and statistics
- X-ray, CT and MRI upload (JPEG, PNG, WebP, up to 10 MB)
- Normal / Abnormal classification with confidence and probabilities
- AI-generated findings and impression
- Explainable AI attention overlay with adjustable opacity and ranked regions
- Patient records, image gallery, searchable scan history
- Analytics charts and model insights
- Printable reports (print or save as PDF from the browser)
- Profile and password management, support requests

## Pages (15)

| No. | Page | File |
|---|---|---|
| 1 | Home | `index.html` |
| 2 | Login | `login.html` |
| 3 | Sign Up | `signup.html` |
| 4 | Dashboard | `dashboard.html` |
| 5 | Upload | `upload.html` |
| 6 | History | `history.html` |
| 7 | Classification | `classification.html` |
| 8 | Explainable AI | `explainable-ai.html` |
| 9 | Gallery | `gallery.html` |
| 10 | Patients | `patients.html` |
| 11 | Analytics | `analytics.html` |
| 12 | Model Insights | `model-insights.html` |
| 13 | Reports | `report.html` |
| 14 | Profile | `profile.html` |
| 15 | Support | `support.html` |

## AI workflow

1. The user creates an account and logs in.
2. The user uploads an X-ray, CT or MRI image.
3. The server validates the image and stores it in Netlify Blobs.
4. A scan record is created with status `processing`.
5. The Gemini vision model analyzes the image.
6. The result (classification, confidence, findings, regions) is saved to the scan.
7. The user views the prediction, the attention overlay and the report.

## Explainable AI

The overlay shows which image regions the model reported as most influential. Red and yellow areas mean higher influence.

> The overlay is drawn from region coordinates returned by the model. It is **not** a validated Grad-CAM explanation.

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript |
| Charts | Chart.js |
| Backend | Netlify Functions |
| API framework | Hono (TypeScript) |
| Database | PostgreSQL (Netlify Database) |
| ORM | Drizzle ORM |
| Image storage | Netlify Blobs |
| AI | Google Gemini Vision |
| Passwords | scrypt hashing |
| Sessions | Opaque tokens, stored as SHA-256 hashes |

## Project structure

```
MediVision-AI/
├── public/            # 15 HTML pages, css/style.css, js/app.js, img/
├── netlify/
│   ├── server/index.ts        # Hono API (served at /api/*)
│   └── database/migrations/   # Reference SQL schema
├── server/            # auth.ts, analyze.ts, storage.ts
├── db/                # index.ts, schema.ts
├── drizzle.config.ts
├── netlify.toml
├── package.json
└── README.md
```

## Setup

1. Clone the repository:
   ```bash
   git clone <your-repository-url>
   cd MediVision-AI
   ```
2. Install dependencies (this also creates `package-lock.json`):
   ```bash
   npm install
   ```
3. Install the Netlify CLI and link the project:
   ```bash
   npm install -g netlify-cli
   netlify login
   netlify link
   ```
4. Create a Netlify Database for the project, then create the tables:
   ```bash
   npm run db:push
   ```
5. Set the environment variables below.
6. Start the app:
   ```bash
   npm run dev
   ```
7. Open http://localhost:8889, create an account and log in.

### Environment variables

| Variable | Purpose |
|---|---|
| `NETLIFY_DATABASE_URL` | PostgreSQL connection string (set by Netlify Database) |
| `GEMINI_API_KEY` | Gemini API key (supplied automatically by Netlify AI Gateway when enabled) |
| `GOOGLE_GEMINI_BASE_URL` | Optional. Set automatically by Netlify AI Gateway |
| `GEMINI_MODEL` | Optional. Defaults to `gemini-2.5-flash` |

## Security

- Passwords are hashed with scrypt and a random salt.
- Session tokens are random, sent in an HttpOnly cookie, and stored only as hashes.
- All data endpoints require authentication and are scoped to the signed-in user.
- Images use random UUID storage keys.
- Uploads are limited to 10 MB and to JPEG, PNG or WebP.

## Database tables

| Table | Purpose |
|---|---|
| `users` | User accounts |
| `sessions` | Authentication sessions |
| `scans` | Scan records and AI results |
| `patients` | Patient information |
| `support_messages` | Support requests |

## Future enhancements

- Password reset by email
- Multi-user healthcare organizations and shared patient records
- DICOM image upload
- Administrator dashboard
- Integration with validated medical imaging models
- Clinician review and approval workflow

## Medical disclaimer

MediVision AI is an academic, AI-assisted medical imaging project. Its predictions, confidence scores, findings and visual explanations are **not** a substitute for professional medical advice, diagnosis or treatment. A qualified healthcare professional must independently review all results before any clinical decision is made.

## Project information

- **Project name:** MediVision AI
- **Title:** Deep Learning-Based Medical Image Classification with Explainable AI
- **Category:** Artificial Intelligence / Machine Learning / Healthcare
- **Type:** Web-based medical imaging decision-support platform
