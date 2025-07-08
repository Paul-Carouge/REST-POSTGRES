const express = require("express");
const router = express.Router();
const { sql } = require("../config/database");
const { ProductSchema } = require("../models/schemas");
const { getProductDetails } = require("../utils/helpers");

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
router.get("/", async (req, res) => {
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
router.get("/:id", async (req, res) => {
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
router.post("/", async (req, res) => {
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
router.delete("/:id", async (req, res) => {
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

module.exports = router; 