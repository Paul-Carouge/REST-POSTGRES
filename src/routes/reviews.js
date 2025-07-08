const express = require("express");
const router = express.Router();
const { sql } = require("../config/database");
const { ReviewSchema, ReviewUpdateSchema } = require("../models/schemas");
const { updateProductScore } = require("../utils/helpers");

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
router.get("/", async (req, res) => {
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
router.get("/:id", async (req, res) => {
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
router.post("/", async (req, res) => {
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
router.put("/:id", async (req, res) => {
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
router.patch("/:id", async (req, res) => {
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
router.delete("/:id", async (req, res) => {
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

module.exports = router; 