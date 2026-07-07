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

// --- CORS ---
const allowedOrigins = [
    'http://localhost:5173',
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

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'impasto-api' }));

app.listen(port, () => {
    console.log(`Impasto API en écoute sur http://localhost:${port}`);
});
