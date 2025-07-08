const express = require("express");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const swaggerOptions = require("./swagger/config");

// Import des routes
const productsRoutes = require("./routes/products");
const usersRoutes = require("./routes/users");
const ordersRoutes = require("./routes/orders");
const reviewsRoutes = require("./routes/reviews");
const f2pGamesRoutes = require("./routes/f2p-games");

const app = express();

// Middleware pour parser le JSON
app.use(express.json());

// Configuration Swagger
const specs = swaggerJsdoc(swaggerOptions);

// Route Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "Marketplace API Documentation"
}));

/**
 * @swagger
 * /:
 *   get:
 *     summary: Page d'accueil de l'API
 *     description: Route de test pour vérifier que l'API fonctionne
 *     tags: [Accueil]
 *     responses:
 *       200:
 *         description: Message de bienvenue
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Hello World!"
 */
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Routes de l'API
app.use("/products", productsRoutes);
app.use("/users", usersRoutes);
app.use("/orders", ordersRoutes);
app.use("/reviews", reviewsRoutes);
app.use("/f2p-games", f2pGamesRoutes);

module.exports = app; 