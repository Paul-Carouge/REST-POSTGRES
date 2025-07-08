const express = require("express");
const postgres = require("postgres");
const z = require("zod");

const app = express();
const port = 8000;
const sql = postgres({ db: "mydb", user: "user", password: "password" });

app.use(express.json());

// Schemas
const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  about: z.string(),
  price: z.number().positive(),
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
  try {
    // Validation des données avec Zod
    const validatedData = ProductSchema.parse(req.body);
    
    const [newProduct] = await sql`
      INSERT INTO products (id, name, about, price)
      VALUES (${validatedData.id}, ${validatedData.name}, ${validatedData.about}, ${validatedData.price})
      RETURNING *
    `;

    res.status(201).json(newProduct);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Données invalides", 
        details: error.errors 
      });
    }
    
    console.error("Erreur lors de la création du produit:", error);
    res.status(500).json({ error: "Erreur du serveur" });
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

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
