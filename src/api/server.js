const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'config', '.env') });

const port = process.env.PORT || 3000;
const app = express();

// --- Routes ---
const authRoutes = require('./routes/auth.routes.js');
const userRoutes = require('./routes/user.routes.js');
const learnerRoutes = require('./routes/learner.routes.js');
const companyRoutes = require('./routes/company.routes.js');
const formationProgramRoutes = require('./routes/formationProgram.routes.js');
const sessionRoutes = require('./routes/session.routes.js');
const enrollmentRoutes = require('./routes/enrollment.routes.js');
const partnerRoutes = require('./routes/partner.routes.js');
const espaceRoutes = require('./routes/espace.routes.js');
const recipeRoutes = require('./routes/recipe.routes.js');
const mercurialeRoutes = require('./routes/mercuriale.routes.js');
const documentRoutes = require('./routes/document.routes.js');
const suiviRoutes = require('./routes/suivi.routes.js');
const organizationRoutes = require('./routes/organization.routes.js');
const saleRoutes = require('./routes/sale.routes.js');
const attendanceRoutes = require('./routes/attendance.routes.js');
const auditRoutes = require('./routes/audit.routes.js');
const invoiceRoutes = require('./routes/invoice.routes.js');
const notificationRoutes = require('./routes/notification.routes.js');
const inventoryRoutes = require('./routes/inventory.routes.js');
const badgesRoutes = require('./routes/badges.routes.js');
const comptabiliteRoutes = require('./routes/comptabilite.routes.js');
const carteRoutes = require('./routes/carte.routes.js');
const quizRoutes = require('./routes/quiz.routes.js');
const templateRoutes = require('./routes/template.routes.js');
const conditionRoutes = require('./routes/condition.routes.js');
const intervenantRoutes = require('./routes/intervenant.routes.js');
const equivalenceRoutes = require('./routes/equivalence.routes.js');
const emargementTemplateRoutes = require('./routes/emargementTemplate.routes.js');
const equipeRoutes = require('./routes/equipe.routes.js');
const platformRoutes = require('./routes/platform.routes.js');
const opcoRoutes = require('./routes/opco.routes.js');
const accessProfileRoutes = require('./routes/accessProfile.routes.js');
const eventsRoutes = require('./routes/events.routes.js');

// --- CORS ---
const allowedOrigins = [
    'http://localhost:5173',
    'https://doc-gestionary.onrender.com'
];

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));

// En-têtes de sécurité de base (sans dépendance).
app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Permitted-Cross-Domain-Policies', 'none');
    // L'API ne renvoie que du JSON/binaire : une CSP stricte limite l'impact
    // d'une éventuelle injection (aucun script/ressource tiers autorisé).
    res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    // HSTS en production (l'app est servie en HTTPS).
    if (process.env.NODE_ENV === 'production') {
        res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

app.use(cookieParser());
app.use(express.json({ limit: '2mb' })); // limite la taille du corps (signatures dataURL)
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Accès menu par utilisateur : bloque les modifications sur une rubrique en lecture seule.
const { enforceSectionMode } = require('./middlewares/sectionAccess.middleware.js');
app.use(enforceSectionMode);

// Diffusion temps réel : après toute modification réussie, notifie l'organisation (SSE).
const { broadcastMutations } = require('./middlewares/realtime.middleware.js');
app.use(broadcastMutations);

// --- Endpoints ---
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/stagiaires', learnerRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/formations', formationProgramRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/partenaires', partnerRoutes);
app.use('/api/mon-espace', espaceRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/mercuriale', mercurialeRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/suivi', suiviRoutes);
app.use('/api/organisation', organizationRoutes);
app.use('/api/ventes', saleRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/factures', invoiceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/inventaire', inventoryRoutes);
app.use('/api/badges', badgesRoutes);
app.use('/api/comptabilite', comptabiliteRoutes);
app.use('/api/carte', carteRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/conditions', conditionRoutes);
app.use('/api/intervenant', intervenantRoutes);
app.use('/api/equivalences', equivalenceRoutes);
app.use('/api/emargement-templates', emargementTemplateRoutes);
app.use('/api/equipe', equipeRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/opcos', opcoRoutes);
app.use('/api/access-profiles', accessProfileRoutes);
app.use('/api/events', eventsRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'impasto-api' }));

app.listen(port, () => {
    console.log(`Impasto API en écoute sur http://localhost:${port}`);
});
