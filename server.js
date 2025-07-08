const express = require("express");
const postgres = require("postgres");
const z = require("zod");
const crypto = require("crypto");

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
