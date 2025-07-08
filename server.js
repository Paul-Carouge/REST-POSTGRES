const express = require("express");
const postgres = require("postgres");
const z = require("zod");
const crypto = require("crypto");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const app = express();
const port = 8000;
const sql = postgres({ db: "mydb", user: "user", password: "password" });

// Configuration Swagger/OpenAPI
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Marketplace API",
      version: "1.0.0",
      description: "API REST complète pour une marketplace avec produits, utilisateurs, commandes, avis et jeux Free-to-Play",
      contact: {
        name: "Support API",
        email: "support@marketplace.com"
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT"
      }
    },
    servers: [
      {
        url: "http://localhost:8000",
        description: "Serveur de développement"
      }
    ],
    components: {
      schemas: {
        Product: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            name: { type: "string", example: "Produit Premium" },
            about: { type: "string", example: "Description détaillée du produit" },
            price: { type: "number", format: "decimal", example: 29.99 },
            total_score: { type: "number", format: "decimal", example: 4.5 },
            reviews_ids: { type: "array", items: { type: "integer" }, example: [1, 2, 3] },
            created_at: { type: "string", format: "date-time" }
          }
        },
        User: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            username: { type: "string", example: "john_doe" },
            email: { type: "string", format: "email", example: "john@example.com" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" }
          }
        },
        Order: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            user_id: { type: "integer", example: 1 },
            product_ids: { type: "array", items: { type: "integer" }, example: [1, 2, 3] },
            total: { type: "number", format: "decimal", example: 36.00 },
            payment: { type: "boolean", example: false },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
            user: { $ref: "#/components/schemas/User" },
            products: { type: "array", items: { $ref: "#/components/schemas/Product" } }
          }
        },
        Review: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            user_id: { type: "integer", example: 1 },
            product_id: { type: "integer", example: 1 },
            score: { type: "integer", minimum: 1, maximum: 5, example: 5 },
            content: { type: "string", example: "Excellent produit !" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
            username: { type: "string", example: "john_doe" },
            email: { type: "string", example: "john@example.com" },
            product_name: { type: "string", example: "Produit 1" }
          }
        },
        Game: {
          type: "object",
          properties: {
            id: { type: "string", example: "game_452" },
            name: { type: "string", example: "World of Tanks" },
            about: { type: "string", example: "Free-to-play tank warfare game" },
            price: { type: "number", example: 0 },
            game_url: { type: "string", example: "https://www.freetogame.com/game/world-of-tanks" },
            genre: { type: "string", example: "Shooter" },
            platform: { type: "string", example: "PC" },
            thumbnail: { type: "string" },
            publisher: { type: "string", example: "Wargaming" },
            developer: { type: "string", example: "Wargaming" },
            release_date: { type: "string", example: "2011-04-12" },
            is_free_to_play: { type: "boolean", example: true }
          }
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string", example: "Message d'erreur" },
            details: { type: "array", items: { type: "object" } }
          }
        },
        Pagination: {
          type: "object",
          properties: {
            page: { type: "integer", example: 1 },
            limit: { type: "integer", example: 10 },
            total: { type: "integer", example: 100 },
            totalPages: { type: "integer", example: 10 },
            hasNext: { type: "boolean", example: true },
            hasPrev: { type: "boolean", example: false }
          }
        }
      },
      responses: {
        NotFound: {
          description: "Ressource non trouvée",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" }
            }
          }
        },
        BadRequest: {
          description: "Données invalides",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" }
            }
          }
        },
        ServerError: {
          description: "Erreur interne du serveur",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" }
            }
          }
        }
      }
    }
  },
  apis: ["./server.js"]
};

const specs = swaggerJsdoc(swaggerOptions);

app.use(express.json());

// Route Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "Marketplace API Documentation"
}));

// Initialisation de la base de données
async function initializeDatabase() {
  try {
    // Créer la table products si elle n'existe pas
    await sql`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        about TEXT NOT NULL,
        price DECIMAL(10,2) NOT NULL CHECK (price > 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Créer la table users si elle n'existe pas
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(128) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Créer la table orders si elle n'existe pas
    await sql`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_ids INTEGER[] NOT NULL,
        total DECIMAL(10,2) NOT NULL CHECK (total >= 0),
        payment BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Créer la table reviews si elle n'existe pas
    await sql`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `;

    // Ajouter les colonnes reviews_ids et total_score à la table products si elles n'existent pas
    await sql`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS reviews_ids INTEGER[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS total_score DECIMAL(3,2) DEFAULT 0.00
    `;
    
    console.log("🟢 Base de données initialisée avec succès");
  } catch (error) {
    console.error("🔴 Erreur lors de l'initialisation de la base de données:", error);
    process.exit(1);
  }
}

// Fonction de hachage SHA512
function hashPassword(password) {
  return crypto.createHash('sha512').update(password).digest('hex');
}

// Fonction pour calculer le total avec TVA (20%)
function calculateTotalWithVAT(productIds, products) {
  const subtotal = productIds.reduce((sum, productId) => {
    const product = products.find(p => p.id === productId);
    return sum + (product ? product.price : 0);
  }, 0);
  
  return Math.round((subtotal * 1.2) * 100) / 100; // TVA 20% arrondie à 2 décimales
}

// Fonction pour récupérer les détails complets d'une commande
async function getOrderDetails(order) {
  // Récupérer l'utilisateur
  const [user] = await sql`
    SELECT id, username, email, created_at, updated_at 
    FROM users WHERE id = ${order.user_id}
  `;

  // Récupérer les produits
  const products = await sql`
    SELECT * FROM products WHERE id = ANY(${order.product_ids})
  `;

  return {
    ...order,
    user,
    products
  };
}

// Fonction pour récupérer les détails complets d'un produit avec ses avis
async function getProductDetails(product) {
  // Récupérer les avis du produit
  const reviews = await sql`
    SELECT r.*, u.username, u.email 
    FROM reviews r 
    JOIN users u ON r.user_id = u.id 
    WHERE r.product_id = ${product.id}
    ORDER BY r.created_at DESC
  `;

  return {
    ...product,
    reviews
  };
}

// Fonction pour mettre à jour le score total d'un produit
async function updateProductScore(productId) {
  // Calculer le nouveau score moyen
  const [result] = await sql`
    SELECT AVG(score) as avg_score, COUNT(*) as review_count
    FROM reviews 
    WHERE product_id = ${productId}
  `;

  const avgScore = result.avg_score ? Math.round(result.avg_score * 100) / 100 : 0;
  const reviewCount = result.review_count || 0;

  // Récupérer tous les IDs des avis
  const reviews = await sql`
    SELECT id FROM reviews WHERE product_id = ${productId} ORDER BY id
  `;
  const reviewIds = reviews.map(r => r.id);

  // Mettre à jour le produit
  await sql`
    UPDATE products 
    SET total_score = ${avgScore}, reviews_ids = ${reviewIds}
    WHERE id = ${productId}
  `;

  return { avgScore, reviewCount };
}

// Schemas pour les produits
const ProductSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  about: z.string().min(1, "La description est requise"),
  price: z.number().positive("Le prix doit être positif"),
});

// Schemas pour les utilisateurs
const UserSchema = z.object({
  username: z.string().min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères"),
  email: z.string().email("Format d'email invalide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
});

// Schema pour la mise à jour complète d'un utilisateur
const UserUpdateSchema = z.object({
  username: z.string().min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères").optional(),
  email: z.string().email("Format d'email invalide").optional(),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères").optional(),
});

// Schema pour la mise à jour partielle d'un utilisateur
const UserPartialUpdateSchema = z.object({
  username: z.string().min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères").optional(),
  email: z.string().email("Format d'email invalide").optional(),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères").optional(),
});

// Schemas pour les commandes
const OrderSchema = z.object({
  userId: z.number().int().positive("L'ID utilisateur doit être un entier positif"),
  productIds: z.array(z.number().int().positive("L'ID produit doit être un entier positif")).min(1, "Au moins un produit est requis"),
});

const OrderUpdateSchema = z.object({
  userId: z.number().int().positive("L'ID utilisateur doit être un entier positif").optional(),
  productIds: z.array(z.number().int().positive("L'ID produit doit être un entier positif")).min(1, "Au moins un produit est requis").optional(),
  payment: z.boolean().optional(),
});

// Schemas pour les avis
const ReviewSchema = z.object({
  userId: z.number().int().positive("L'ID utilisateur doit être un entier positif"),
  productId: z.number().int().positive("L'ID produit doit être un entier positif"),
  score: z.number().int().min(1, "Le score doit être au moins 1").max(5, "Le score doit être au maximum 5"),
  content: z.string().min(1, "Le contenu de l'avis est requis").max(1000, "Le contenu ne peut pas dépasser 1000 caractères"),
});

const ReviewUpdateSchema = z.object({
  score: z.number().int().min(1, "Le score doit être au moins 1").max(5, "Le score doit être au maximum 5").optional(),
  content: z.string().min(1, "Le contenu de l'avis est requis").max(1000, "Le contenu ne peut pas dépasser 1000 caractères").optional(),
});

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

/**
 * @swagger
 * /products:
 *   get:
 *     summary: Récupère tous les produits ou recherche des jeux Free-to-Play
 *     description: |
 *       Récupère la liste des produits avec pagination. 
 *       Si des paramètres de recherche sont fournis (name, about, price), 
 *       utilise l'API FreeToGame pour rechercher des jeux Free-to-Play.
 *     tags: [Produits]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Numéro de page pour la pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Nombre d'éléments par page
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Recherche de jeux par nom (active l'API FreeToGame)
 *       - in: query
 *         name: about
 *         schema:
 *           type: string
 *         description: Recherche de jeux par description/genre (active l'API FreeToGame)
 *       - in: query
 *         name: price
 *         schema:
 *           type: number
 *         description: Recherche de jeux par prix maximum (active l'API FreeToGame)
 *     responses:
 *       200:
 *         description: Liste des produits ou jeux trouvés
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 products:
 *                   type: array
 *                   items:
 *                     oneOf:
 *                       - $ref: '#/components/schemas/Product'
 *                       - $ref: '#/components/schemas/Game'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *                 searchType:
 *                   type: string
 *                   enum: [free-to-play-games, database-products]
 *                 filters:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     about:
 *                       type: string
 *                     price:
 *                       type: number
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Récupération de tous les produits avec pagination et recherche de jeux Free-to-Play
app.get("/products", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Paramètres de recherche pour les jeux
    const { name, about, price } = req.query;
    
    let products = [];
    let totalCount = 0;
    let isGameSearch = false;

    // Si on a des paramètres de recherche de jeux, utiliser l'API FreeToGame
    if (name || about || price) {
      isGameSearch = true;
      console.log("🎮 Recherche de jeux Free-to-Play avec les paramètres:", { name, about, price });
      
      try {
        // Récupérer tous les jeux depuis l'API FreeToGame
        const response = await fetch("https://www.freetogame.com/api/games");
        
        if (!response.ok) {
          throw new Error(`Erreur API FreeToGame: ${response.status} ${response.statusText}`);
        }
        
        let games = await response.json();
        
        // Filtrer les jeux selon les critères
        if (name) {
          games = games.filter(game => 
            game.title.toLowerCase().includes(name.toLowerCase())
          );
        }
        
        if (about) {
          games = games.filter(game => 
            game.short_description.toLowerCase().includes(about.toLowerCase()) ||
            game.genre.toLowerCase().includes(about.toLowerCase())
          );
        }
        
        if (price) {
          const maxPrice = parseFloat(price);
          if (!isNaN(maxPrice)) {
            // Les jeux Free-to-Play ont un prix de 0, donc on trie par popularité
            games = games.filter(game => {
              // Si le jeu a un prix, on le compare
              if (game.price) {
                return parseFloat(game.price) <= maxPrice;
              }
              // Sinon c'est un jeu gratuit (prix 0)
              return true;
            });
          }
        }
        
        // Appliquer la pagination
        totalCount = games.length;
        const startIndex = offset;
        const endIndex = startIndex + limit;
        products = games.slice(startIndex, endIndex);
        
        // Transformer les jeux en format produit
        products = products.map(game => ({
          id: `game_${game.id}`,
          name: game.title,
          about: game.short_description,
          price: 0, // Les jeux Free-to-Play sont gratuits
          game_url: game.game_url,
          genre: game.genre,
          platform: game.platform,
          thumbnail: game.thumbnail,
          publisher: game.publisher,
          developer: game.developer,
          release_date: game.release_date,
          is_free_to_play: true
        }));
        
      } catch (apiError) {
        console.error("Erreur lors de l'appel à l'API FreeToGame:", apiError);
        // En cas d'erreur API, on continue avec les produits de la base de données
        isGameSearch = false;
      }
    }
    
    // Si ce n'est pas une recherche de jeux ou si l'API a échoué, utiliser la base de données
    if (!isGameSearch) {
      products = await sql`
        SELECT * FROM products 
        ORDER BY id 
        LIMIT ${limit} OFFSET ${offset}
      `;

      // Compter le nombre total de produits pour la pagination
      const [{ count }] = await sql`SELECT COUNT(*) as count FROM products`;
      totalCount = count;
    }

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      products,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      searchType: isGameSearch ? "free-to-play-games" : "database-products",
      filters: isGameSearch ? { name, about, price } : null
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des produits:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Récupère un produit par son ID
 *     description: Récupère les détails complets d'un produit, y compris tous ses avis
 *     tags: [Produits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du produit
 *     responses:
 *       200:
 *         description: Détails du produit avec ses avis
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Product'
 *                 - type: object
 *                   properties:
 *                     reviews:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Review'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Récupération d'un produit par son ID
app.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const [product] = await sql`
      SELECT * FROM products WHERE id = ${id}
    `;

    // Cas ou le produit n'existe pas
    if (!product) {
      return res.status(404).json({ error: "Produit non trouvé" });
    }

    // Récupérer les détails complets avec les avis
    const productWithReviews = await getProductDetails(product);

    res.json(productWithReviews);
  } catch (error) {
    console.error("Erreur lors de la récupération du produit:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

/**
 * @swagger
 * /products:
 *   post:
 *     summary: Crée un nouveau produit
 *     description: Crée un nouveau produit dans la base de données
 *     tags: [Produits]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - about
 *               - price
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 example: "Produit Premium"
 *               about:
 *                 type: string
 *                 minLength: 1
 *                 example: "Description détaillée du produit"
 *               price:
 *                 type: number
 *                 minimum: 0.01
 *                 example: 29.99
 *     responses:
 *       200:
 *         description: Produit créé avec succès
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Créer un nouveau produit
app.post("/products", async (req, res) => {
  const result = await ProductSchema.safeParse(req.body);
 
  // Si Zod a réussi à parser le corps de la requête
  if (result.success) {
    const { name, about, price } = result.data;
 
    const product = await sql`
    INSERT INTO products (name, about, price)
    VALUES (${name}, ${about}, ${price})
    RETURNING *
    `;
 
    res.send(product[0]);
  } else {
    res.status(400).send(result);
  }
});

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Supprime un produit
 *     description: Supprime un produit et tous ses avis associés
 *     tags: [Produits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du produit à supprimer
 *     responses:
 *       200:
 *         description: Produit supprimé avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Produit supprimé avec succès"
 *                 product:
 *                   $ref: '#/components/schemas/Product'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Supprime un produit grace à son ID
app.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const [deletedProduct] = await sql`
      DELETE FROM products WHERE id = ${id}
      RETURNING *
    `;

    // Cas ou le produit n'existe pas
    if (!deletedProduct) {
      return res.status(404).json({ error: "Produit non trouvé" });
    }

    res.json({ message: "Produit supprimé avec succès", product: deletedProduct });
  } catch (error) {
    console.error("Erreur lors de la suppression du produit:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Récupère tous les utilisateurs
 *     description: Récupère la liste des utilisateurs avec pagination (mots de passe exclus)
 *     tags: [Utilisateurs]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Numéro de page pour la pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Nombre d'éléments par page
 *     responses:
 *       200:
 *         description: Liste des utilisateurs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Récupération de tous les utilisateurs avec pagination de 10 utilisateurs par page
app.get("/users", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const users = await sql`
      SELECT id, username, email, created_at, updated_at 
      FROM users 
      ORDER BY id 
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Compter le nombre total d'utilisateurs pour la pagination
    const [{ count }] = await sql`SELECT COUNT(*) as count FROM users`;
    const totalPages = Math.ceil(count / limit);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des utilisateurs:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Récupération d'un utilisateur par son ID
app.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const [user] = await sql`
      SELECT id, username, email, created_at, updated_at 
      FROM users WHERE id = ${id}
    `;

    // Cas où l'utilisateur n'existe pas
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }

    res.json(user);
  } catch (error) {
    console.error("Erreur lors de la récupération de l'utilisateur:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Crée un nouvel utilisateur
 *     description: Crée un nouvel utilisateur avec mot de passe haché en SHA512
 *     tags: [Utilisateurs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 example: "john_doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john@example.com"
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: "motdepasse123"
 *     responses:
 *       201:
 *         description: Utilisateur créé avec succès
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       409:
 *         description: Conflit - Utilisateur déjà existant
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Un utilisateur avec ce nom d'utilisateur ou cet email existe déjà"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Création d'un nouvel utilisateur
app.post("/users", async (req, res) => {
  try {
    const result = await UserSchema.safeParse(req.body);
    
    if (result.success) {
      const { username, email, password } = result.data;
      const passwordHash = hashPassword(password);

      // Vérifier si l'utilisateur existe déjà
      const existingUser = await sql`
        SELECT id FROM users WHERE username = ${username} OR email = ${email}
      `;

      if (existingUser.length > 0) {
        return res.status(409).json({ 
          error: "Un utilisateur avec ce nom d'utilisateur ou cet email existe déjà" 
        });
      }

      const [newUser] = await sql`
        INSERT INTO users (username, email, password_hash)
        VALUES (${username}, ${email}, ${passwordHash})
        RETURNING id, username, email, created_at, updated_at
      `;

      res.status(201).json(newUser);
    } else {
      res.status(400).json({ 
        error: "Données invalides", 
        details: result.error.errors 
      });
    }
  } catch (error) {
    console.error("Erreur lors de la création de l'utilisateur:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Mise à jour complète d'un utilisateur
app.put("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await UserUpdateSchema.safeParse(req.body);
    
    if (result.success) {
      const { username, email, password } = result.data;
      
      // Vérifier si l'utilisateur existe
      const [existingUser] = await sql`
        SELECT id FROM users WHERE id = ${id}
      `;

      if (!existingUser) {
        return res.status(404).json({ error: "Utilisateur non trouvé" });
      }

      // Vérifier si le nouveau username/email existe déjà (sauf pour l'utilisateur actuel)
      if (username || email) {
        const conflictUser = await sql`
          SELECT id FROM users 
          WHERE (username = ${username} OR email = ${email}) 
          AND id != ${id}
        `;

        if (conflictUser.length > 0) {
          return res.status(409).json({ 
            error: "Un utilisateur avec ce nom d'utilisateur ou cet email existe déjà" 
          });
        }
      }

      // Vérifier qu'au moins un champ est fourni
      if (!username && !email && !password) {
        return res.status(400).json({ error: "Aucune donnée à mettre à jour" });
      }

      let updatedUser;
      if (username && email && password) {
        [updatedUser] = await sql`
          UPDATE users SET username = ${username}, email = ${email}, password_hash = ${hashPassword(password)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, username, email, created_at, updated_at
        `;
      } else if (username && email) {
        [updatedUser] = await sql`
          UPDATE users SET username = ${username}, email = ${email}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, username, email, created_at, updated_at
        `;
      } else if (username && password) {
        [updatedUser] = await sql`
          UPDATE users SET username = ${username}, password_hash = ${hashPassword(password)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, username, email, created_at, updated_at
        `;
      } else if (email && password) {
        [updatedUser] = await sql`
          UPDATE users SET email = ${email}, password_hash = ${hashPassword(password)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, username, email, created_at, updated_at
        `;
      } else if (username) {
        [updatedUser] = await sql`
          UPDATE users SET username = ${username}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, username, email, created_at, updated_at
        `;
      } else if (email) {
        [updatedUser] = await sql`
          UPDATE users SET email = ${email}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, username, email, created_at, updated_at
        `;
      } else if (password) {
        [updatedUser] = await sql`
          UPDATE users SET password_hash = ${hashPassword(password)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, username, email, created_at, updated_at
        `;
      }

      res.json(updatedUser);
    } else {
      res.status(400).json({ 
        error: "Données invalides", 
        details: result.error.errors 
      });
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'utilisateur:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Mise à jour partielle d'un utilisateur
app.patch("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await UserPartialUpdateSchema.safeParse(req.body);
    
    if (result.success) {
      const { username, email, password } = result.data;
      
      // Vérifier si l'utilisateur existe
      const [existingUser] = await sql`
        SELECT id FROM users WHERE id = ${id}
      `;

      if (!existingUser) {
        return res.status(404).json({ error: "Utilisateur non trouvé" });
      }

      // Vérifier si le nouveau username/email existe déjà (sauf pour l'utilisateur actuel)
      if (username || email) {
        const conflictUser = await sql`
          SELECT id FROM users 
          WHERE (username = ${username} OR email = ${email}) 
          AND id != ${id}
        `;

        if (conflictUser.length > 0) {
          return res.status(409).json({ 
            error: "Un utilisateur avec ce nom d'utilisateur ou cet email existe déjà" 
          });
        }
      }

      // Vérifier qu'au moins un champ est fourni
      if (!username && !email && !password) {
        return res.status(400).json({ error: "Aucune donnée à mettre à jour" });
      }

      let updatedUser;
      if (username && email && password) {
        [updatedUser] = await sql`
          UPDATE users SET username = ${username}, email = ${email}, password_hash = ${hashPassword(password)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, username, email, created_at, updated_at
        `;
      } else if (username && email) {
        [updatedUser] = await sql`
          UPDATE users SET username = ${username}, email = ${email}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, username, email, created_at, updated_at
        `;
      } else if (username && password) {
        [updatedUser] = await sql`
          UPDATE users SET username = ${username}, password_hash = ${hashPassword(password)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, username, email, created_at, updated_at
        `;
      } else if (email && password) {
        [updatedUser] = await sql`
          UPDATE users SET email = ${email}, password_hash = ${hashPassword(password)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, username, email, created_at, updated_at
        `;
      } else if (username) {
        [updatedUser] = await sql`
          UPDATE users SET username = ${username}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, username, email, created_at, updated_at
        `;
      } else if (email) {
        [updatedUser] = await sql`
          UPDATE users SET email = ${email}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, username, email, created_at, updated_at
        `;
      } else if (password) {
        [updatedUser] = await sql`
          UPDATE users SET password_hash = ${hashPassword(password)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, username, email, created_at, updated_at
        `;
      }

      res.json(updatedUser);
    } else {
      res.status(400).json({ 
        error: "Données invalides", 
        details: result.error.errors 
      });
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour partielle de l'utilisateur:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Suppression d'un utilisateur grace à son ID
app.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const [deletedUser] = await sql`
      DELETE FROM users WHERE id = ${id}
      RETURNING id, username, email, created_at, updated_at
    `;

    // Cas où l'utilisateur n'existe pas
    if (!deletedUser) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }

    res.json({ 
      message: "Utilisateur supprimé avec succès", 
      user: deletedUser 
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de l'utilisateur:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});



/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Récupère toutes les commandes
 *     description: Récupère la liste des commandes avec pagination et détails complets (utilisateur + produits)
 *     tags: [Commandes]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Numéro de page pour la pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Nombre d'éléments par page
 *     responses:
 *       200:
 *         description: Liste des commandes avec détails complets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Récupération de toutes les commandes avec pagination de 10 commandes par page
app.get("/orders", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const orders = await sql`
      SELECT * FROM orders 
      ORDER BY created_at DESC 
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Compter le nombre total de commandes pour la pagination
    const [{ count }] = await sql`SELECT COUNT(*) as count FROM orders`;
    const totalPages = Math.ceil(count / limit);

    // Récupérer les détails complets pour chaque commande
    const ordersWithDetails = await Promise.all(
      orders.map(order => getOrderDetails(order))
    );

    res.json({
      orders: ordersWithDetails,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des commandes:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Récupération d'une commande par son ID
app.get("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const [order] = await sql`
      SELECT * FROM orders WHERE id = ${id}
    `;

    // Cas où la commande n'existe pas
    if (!order) {
      return res.status(404).json({ error: "Commande non trouvée" });
    }

    // Récupérer les détails complets
    const orderWithDetails = await getOrderDetails(order);

    res.json(orderWithDetails);
  } catch (error) {
    console.error("Erreur lors de la récupération de la commande:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Crée une nouvelle commande
 *     description: Crée une nouvelle commande avec calcul automatique du total avec TVA (20%)
 *     tags: [Commandes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - productIds
 *             properties:
 *               userId:
 *                 type: integer
 *                 minimum: 1
 *                 example: 1
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                   minimum: 1
 *                 minItems: 1
 *                 example: [1, 2, 3]
 *     responses:
 *       201:
 *         description: Commande créée avec succès
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         description: Utilisateur ou produit non trouvé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Utilisateur non trouvé"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Création d'une nouvelle commande
app.post("/orders", async (req, res) => {
  try {
    const result = await OrderSchema.safeParse(req.body);
    
    if (result.success) {
      const { userId, productIds } = result.data;

      // Vérifier si l'utilisateur existe
      const [user] = await sql`
        SELECT id FROM users WHERE id = ${userId}
      `;

      if (!user) {
        return res.status(404).json({ error: "Utilisateur non trouvé" });
      }

      // Vérifier si tous les produits existent
      const products = await sql`
        SELECT * FROM products WHERE id = ANY(${productIds})
      `;

      if (products.length !== productIds.length) {
        return res.status(404).json({ 
          error: "Un ou plusieurs produits n'existent pas" 
        });
      }

      // Calculer le total avec TVA
      const total = calculateTotalWithVAT(productIds, products);

      const [newOrder] = await sql`
        INSERT INTO orders (user_id, product_ids, total, payment)
        VALUES (${userId}, ${productIds}, ${total}, FALSE)
        RETURNING *
      `;

      // Récupérer les détails complets
      const orderWithDetails = await getOrderDetails(newOrder);

      res.status(201).json(orderWithDetails);
    } else {
      res.status(400).json({ 
        error: "Données invalides", 
        details: result.error.errors 
      });
    }
  } catch (error) {
    console.error("Erreur lors de la création de la commande:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Mise à jour complète d'une commande
app.put("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await OrderUpdateSchema.safeParse(req.body);
    
    if (result.success) {
      const { userId, productIds, payment } = result.data;
      
      // Vérifier si la commande existe
      const [existingOrder] = await sql`
        SELECT * FROM orders WHERE id = ${id}
      `;

      if (!existingOrder) {
        return res.status(404).json({ error: "Commande non trouvée" });
      }

      // Préparer les données de mise à jour
      let updateData = {};
      let newTotal = existingOrder.total;

      if (userId) {
        // Vérifier si l'utilisateur existe
        const [user] = await sql`
          SELECT id FROM users WHERE id = ${userId}
        `;
        if (!user) {
          return res.status(404).json({ error: "Utilisateur non trouvé" });
        }
        updateData.user_id = userId;
      }

      if (productIds) {
        // Vérifier si tous les produits existent
        const products = await sql`
          SELECT * FROM products WHERE id = ANY(${productIds})
        `;
        if (products.length !== productIds.length) {
          return res.status(404).json({ 
            error: "Un ou plusieurs produits n'existent pas" 
          });
        }
        updateData.product_ids = productIds;
        newTotal = calculateTotalWithVAT(productIds, products);
      }

      if (payment !== undefined) {
        updateData.payment = payment;
      }

      // Construire la requête SQL de manière conditionnelle
      let updatedOrder;
      if (userId && productIds && payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, product_ids = ${productIds}, total = ${newTotal}, payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (userId && productIds) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, product_ids = ${productIds}, total = ${newTotal}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (userId && payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (productIds && payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET product_ids = ${productIds}, total = ${newTotal}, payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (userId) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (productIds) {
        [updatedOrder] = await sql`
          UPDATE orders SET product_ids = ${productIds}, total = ${newTotal}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      }

      // Récupérer les détails complets
      const orderWithDetails = await getOrderDetails(updatedOrder);

      res.json(orderWithDetails);
    } else {
      res.status(400).json({ 
        error: "Données invalides", 
        details: result.error.errors 
      });
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la commande:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Mise à jour partielle d'une commande
app.patch("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await OrderUpdateSchema.safeParse(req.body);
    
    if (result.success) {
      const { userId, productIds, payment } = result.data;
      
      // Vérifier si la commande existe
      const [existingOrder] = await sql`
        SELECT * FROM orders WHERE id = ${id}
      `;

      if (!existingOrder) {
        return res.status(404).json({ error: "Commande non trouvée" });
      }

      // Préparer les données de mise à jour
      let updateData = {};
      let newTotal = existingOrder.total;

      if (userId) {
        // Vérifier si l'utilisateur existe
        const [user] = await sql`
          SELECT id FROM users WHERE id = ${userId}
        `;
        if (!user) {
          return res.status(404).json({ error: "Utilisateur non trouvé" });
        }
        updateData.user_id = userId;
      }

      if (productIds) {
        // Vérifier si tous les produits existent
        const products = await sql`
          SELECT * FROM products WHERE id = ANY(${productIds})
        `;
        if (products.length !== productIds.length) {
          return res.status(404).json({ 
            error: "Un ou plusieurs produits n'existent pas" 
          });
        }
        updateData.product_ids = productIds;
        newTotal = calculateTotalWithVAT(productIds, products);
      }

      if (payment !== undefined) {
        updateData.payment = payment;
      }

      // Construire la requête SQL de manière conditionnelle
      let updatedOrder;
      if (userId && productIds && payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, product_ids = ${productIds}, total = ${newTotal}, payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (userId && productIds) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, product_ids = ${productIds}, total = ${newTotal}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (userId && payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (productIds && payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET product_ids = ${productIds}, total = ${newTotal}, payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (userId) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (productIds) {
        [updatedOrder] = await sql`
          UPDATE orders SET product_ids = ${productIds}, total = ${newTotal}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      }

      // Récupérer les détails complets
      const orderWithDetails = await getOrderDetails(updatedOrder);

      res.json(orderWithDetails);
    } else {
      res.status(400).json({ 
        error: "Données invalides", 
        details: result.error.errors 
      });
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour partielle de la commande:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Suppression d'une commande
app.delete("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const [deletedOrder] = await sql`
      DELETE FROM orders WHERE id = ${id}
      RETURNING *
    `;

    // Cas où la commande n'existe pas
    if (!deletedOrder) {
      return res.status(404).json({ error: "Commande non trouvée" });
    }

    // Récupérer les détails complets avant suppression
    const orderWithDetails = await getOrderDetails(deletedOrder);

    res.json({ 
      message: "Commande supprimée avec succès", 
      order: orderWithDetails 
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de la commande:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Routes pour la ressource "reviews" (Avis)

/**
 * @swagger
 * /reviews:
 *   get:
 *     summary: Récupère tous les avis
 *     description: Récupère la liste des avis avec pagination et détails complets (utilisateur + produit)
 *     tags: [Avis]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Numéro de page pour la pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Nombre d'éléments par page
 *     responses:
 *       200:
 *         description: Liste des avis avec détails complets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reviews:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Review'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// GET /reviews - Récupère tous les avis avec pagination
app.get("/reviews", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const reviews = await sql`
      SELECT r.*, u.username, u.email, p.name as product_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      JOIN products p ON r.product_id = p.id
      ORDER BY r.created_at DESC 
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Compter le nombre total d'avis pour la pagination
    const [{ count }] = await sql`SELECT COUNT(*) as count FROM reviews`;
    const totalPages = Math.ceil(count / limit);

    res.json({
      reviews,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des avis:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Récupération d'un avis par son ID
app.get("/reviews/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const [review] = await sql`
      SELECT r.*, u.username, u.email, p.name as product_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      JOIN products p ON r.product_id = p.id
      WHERE r.id = ${id}
    `;

    // Cas où l'avis n'existe pas
    if (!review) {
      return res.status(404).json({ error: "Avis non trouvé" });
    }

    res.json(review);
  } catch (error) {
    console.error("Erreur lors de la récupération de l'avis:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

/**
 * @swagger
 * /reviews:
 *   post:
 *     summary: Crée un nouvel avis
 *     description: Crée un nouvel avis et met à jour automatiquement le score du produit
 *     tags: [Avis]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - productId
 *               - score
 *               - content
 *             properties:
 *               userId:
 *                 type: integer
 *                 minimum: 1
 *                 example: 1
 *               productId:
 *                 type: integer
 *                 minimum: 1
 *                 example: 1
 *               score:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 1000
 *                 example: "Excellent produit, je recommande !"
 *     responses:
 *       201:
 *         description: Avis créé avec succès
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Review'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         description: Utilisateur ou produit non trouvé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Utilisateur non trouvé"
 *       409:
 *         description: Conflit - Avis déjà existant
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Vous avez déjà laissé un avis pour ce produit"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Création d'un nouvel avis
app.post("/reviews", async (req, res) => {
  try {
    const result = await ReviewSchema.safeParse(req.body);
    
    if (result.success) {
      const { userId, productId, score, content } = result.data;

      // Vérifier si l'utilisateur existe
      const [user] = await sql`
        SELECT id FROM users WHERE id = ${userId}
      `;

      if (!user) {
        return res.status(404).json({ error: "Utilisateur non trouvé" });
      }

      // Vérifier si le produit existe
      const [product] = await sql`
        SELECT id FROM products WHERE id = ${productId}
      `;

      if (!product) {
        return res.status(404).json({ error: "Produit non trouvé" });
      }

      // Vérifier si l'utilisateur a déjà laissé un avis pour ce produit
      const [existingReview] = await sql`
        SELECT id FROM reviews WHERE user_id = ${userId} AND product_id = ${productId}
      `;

      if (existingReview) {
        return res.status(409).json({ 
          error: "Vous avez déjà laissé un avis pour ce produit" 
        });
      }

      const [newReview] = await sql`
        INSERT INTO reviews (user_id, product_id, score, content)
        VALUES (${userId}, ${productId}, ${score}, ${content})
        RETURNING *
      `;

      // Mettre à jour le score du produit
      await updateProductScore(productId);

      // Récupérer l'avis avec les détails complets
      const [reviewWithDetails] = await sql`
        SELECT r.*, u.username, u.email, p.name as product_name
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        JOIN products p ON r.product_id = p.id
        WHERE r.id = ${newReview.id}
      `;

      res.status(201).json(reviewWithDetails);
    } else {
      res.status(400).json({ 
        error: "Données invalides", 
        details: result.error.errors 
      });
    }
  } catch (error) {
    console.error("Erreur lors de la création de l'avis:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Mise à jour complète d'un avis
app.put("/reviews/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await ReviewUpdateSchema.safeParse(req.body);
    
    if (result.success) {
      const { score, content } = result.data;
      
      // Vérifier si l'avis existe
      const [existingReview] = await sql`
        SELECT * FROM reviews WHERE id = ${id}
      `;

      if (!existingReview) {
        return res.status(404).json({ error: "Avis non trouvé" });
      }

      // Vérifier qu'au moins un champ est fourni
      if (score === undefined && content === undefined) {
        return res.status(400).json({ error: "Aucune donnée à mettre à jour" });
      }

      // Construire la requête SQL de manière conditionnelle
      let updatedReview;
      if (score !== undefined && content !== undefined) {
        [updatedReview] = await sql`
          UPDATE reviews SET score = ${score}, content = ${content}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (score !== undefined) {
        [updatedReview] = await sql`
          UPDATE reviews SET score = ${score}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (content !== undefined) {
        [updatedReview] = await sql`
          UPDATE reviews SET content = ${content}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      }

      // Mettre à jour le score du produit
      await updateProductScore(updatedReview.product_id);

      // Récupérer l'avis avec les détails complets
      const [reviewWithDetails] = await sql`
        SELECT r.*, u.username, u.email, p.name as product_name
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        JOIN products p ON r.product_id = p.id
        WHERE r.id = ${id}
      `;

      res.json(reviewWithDetails);
    } else {
      res.status(400).json({ 
        error: "Données invalides", 
        details: result.error.errors 
      });
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'avis:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Mise à jour partielle d'un avis
app.patch("/reviews/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await ReviewUpdateSchema.safeParse(req.body);
    
    if (result.success) {
      const { score, content } = result.data;
      
      // Vérifier si l'avis existe
      const [existingReview] = await sql`
        SELECT * FROM reviews WHERE id = ${id}
      `;

      if (!existingReview) {
        return res.status(404).json({ error: "Avis non trouvé" });
      }

      // Vérifier qu'au moins un champ est fourni
      if (score === undefined && content === undefined) {
        return res.status(400).json({ error: "Aucune donnée à mettre à jour" });
      }

      // Construire la requête SQL de manière conditionnelle
      let updatedReview;
      if (score !== undefined && content !== undefined) {
        [updatedReview] = await sql`
          UPDATE reviews SET score = ${score}, content = ${content}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (score !== undefined) {
        [updatedReview] = await sql`
          UPDATE reviews SET score = ${score}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (content !== undefined) {
        [updatedReview] = await sql`
          UPDATE reviews SET content = ${content}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      }

      // Mettre à jour le score du produit
      await updateProductScore(updatedReview.product_id);

      // Récupérer l'avis avec les détails complets
      const [reviewWithDetails] = await sql`
        SELECT r.*, u.username, u.email, p.name as product_name
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        JOIN products p ON r.product_id = p.id
        WHERE r.id = ${id}
      `;

      res.json(reviewWithDetails);
    } else {
      res.status(400).json({ 
        error: "Données invalides", 
        details: result.error.errors 
      });
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour partielle de l'avis:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Suppression d'un avis
app.delete("/reviews/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Récupérer l'avis avant suppression pour avoir le product_id
    const [reviewToDelete] = await sql`
      SELECT * FROM reviews WHERE id = ${id}
    `;

    if (!reviewToDelete) {
      return res.status(404).json({ error: "Avis non trouvé" });
    }

    const [deletedReview] = await sql`
      DELETE FROM reviews WHERE id = ${id}
      RETURNING *
    `;

    // Mettre à jour le score du produit
    await updateProductScore(reviewToDelete.product_id);

    // Récupérer l'avis avec les détails complets avant suppression
    const [reviewWithDetails] = await sql`
      SELECT r.*, u.username, u.email, p.name as product_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      JOIN products p ON r.product_id = p.id
      WHERE r.id = ${id}
    `;

    res.json({ 
      message: "Avis supprimé avec succès", 
      review: reviewWithDetails 
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de l'avis:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

/**
 * @swagger
 * /f2p-games:
 *   get:
 *     summary: Récupère des jeux Free-to-Play
 *     description: Récupère des jeux Free-to-Play depuis l'API FreeToGame avec filtres optionnels
 *     tags: [Jeux Free-to-Play]
 *     parameters:
 *       - in: query
 *         name: platform
 *         schema:
 *           type: string
 *           enum: [pc, browser, all]
 *         description: Plateforme des jeux (pc, browser, all)
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Catégorie des jeux (mmorpg, shooter, pvp, etc.)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [release-date, popularity, alphabetical, relevance]
 *         description: Méthode de tri
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *         description: Tags multiples séparés par des points (ex: 3d.mmorpg.fantasy.pvp)
 *     responses:
 *       200:
 *         description: Liste des jeux Free-to-Play
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 games:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Game'
 *                 total:
 *                   type: integer
 *                   example: 150
 *                 filters:
 *                   type: object
 *                   properties:
 *                     platform:
 *                       type: string
 *                     category:
 *                       type: string
 *                     sortBy:
 *                       type: string
 *                     tag:
 *                       type: string
 *                 apiSource:
 *                   type: string
 *                   example: "FreeToGame API"
 *       500:
 *         description: Erreur lors de la récupération des jeux
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Erreur lors de la récupération des jeux"
 *                 details:
 *                   type: string
 *                   example: "Erreur API FreeToGame: 500 Internal Server Error"
 */
// Récupération de tous les jeux Free-to-Play avec filtres optionnels
app.get("/f2p-games", async (req, res) => {
  try {
    const { platform, category, sortBy, tag } = req.query;
    
    // Construire l'URL de l'API FreeToGame avec les paramètres
    let apiUrl = "https://www.freetogame.com/api/games";
    const params = new URLSearchParams();
    
    if (platform) params.append("platform", platform);
    if (category) params.append("category", category);
    if (sortBy) params.append("sort-by", sortBy);
    
    // Si on a des tags, utiliser l'endpoint /filter
    if (tag) {
      apiUrl = "https://www.freetogame.com/api/filter";
      params.append("tag", tag);
      if (platform) params.append("platform", platform);
      if (sortBy) params.append("sort", sortBy);
    }
    
    if (params.toString()) {
      apiUrl += "?" + params.toString();
    }

    console.log(`🔄 Appel API FreeToGame: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`Erreur API FreeToGame: ${response.status} ${response.statusText}`);
    }
    
    const games = await response.json();
    
    // Ajouter des informations de pagination si nécessaire
    const result = {
      games,
      total: games.length,
      filters: {
        platform: platform || "all",
        category: category || "all",
        sortBy: sortBy || "relevance",
        tag: tag || null
      },
      apiSource: "FreeToGame API"
    };
    
    res.json(result);
  } catch (error) {
    console.error("Erreur lors de la récupération des jeux Free-to-Play:", error);
    res.status(500).json({ 
      error: "Erreur lors de la récupération des jeux",
      details: error.message 
    });
  }
});

// Récupération des détails d'un jeu spécifique grace à son ID
app.get("/f2p-games/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "ID de jeu invalide" });
    }
    
    const apiUrl = `https://www.freetogame.com/api/game?id=${id}`;
    
    console.log(`🔄 Appel API FreeToGame pour le jeu ID ${id}: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: "Jeu non trouvé" });
      }
      throw new Error(`Erreur API FreeToGame: ${response.status} ${response.statusText}`);
    }
    
    const game = await response.json();
    
    const result = {
      game,
      apiSource: "FreeToGame API"
    };
    
    res.json(result);
  } catch (error) {
    console.error("Erreur lors de la récupération du jeu:", error);
    res.status(500).json({ 
      error: "Erreur lors de la récupération du jeu",
      details: error.message 
    });
  }
});

// Démarrage du serveur avec initialisation de la base de données
async function startServer() {
  await initializeDatabase();
  
  app.listen(port, () => {
    console.log(`🟢 Le serveur est lancé sur http://localhost:${port}`);
  });
}

startServer();
