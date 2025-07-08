const express = require("express");
const postgres = require("postgres");
const z = require("zod");

const app = express();
const port = 8000;
const sql = postgres({ db: "mydb", user: "user", password: "password" });

app.use(express.json());

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
    
    console.log("Base de données initialisée avec succès");
  } catch (error) {
    console.error("Erreur lors de l'initialisation de la base de données:", error);
    process.exit(1);
  }
}

// Schemas
const ProductSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  about: z.string().min(1, "La description est requise"),
  price: z.number().positive("Le prix doit être positif"),
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Récupération de tous les produits avec pagination de 10 produits par page
app.get("/products", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const products = await sql`
      SELECT * FROM products 
      ORDER BY id 
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Permet de compté le nombre total de produits pour la pagination
    const [{ count }] = await sql`SELECT COUNT(*) as count FROM products`;
    const totalPages = Math.ceil(count / limit);

    res.json({
      products,
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
    console.error("Erreur lors de la récupération des produits:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

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

    res.json(product);
  } catch (error) {
    console.error("Erreur lors de la récupération du produit:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

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

// Démarrage du serveur avec initialisation de la base de données
async function startServer() {
  await initializeDatabase();
  
  app.listen(port, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${port}`);
  });
}

startServer();
