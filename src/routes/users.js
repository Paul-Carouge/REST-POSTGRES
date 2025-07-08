const express = require("express");
const router = express.Router();
const { sql } = require("../config/database");
const { UserSchema, UserUpdateSchema, UserPartialUpdateSchema } = require("../models/schemas");
const { hashPassword } = require("../utils/helpers");

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
router.get("/", async (req, res) => {
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
router.get("/:id", async (req, res) => {
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
router.post("/", async (req, res) => {
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
router.put("/:id", async (req, res) => {
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
router.patch("/:id", async (req, res) => {
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
router.delete("/:id", async (req, res) => {
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

module.exports = router; 