const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Paul Carouge API",
      version: "1.0.0",
      description: "Une API REST basé sur le TP de Service Web avec Produits, Utilisateurs, Commandes, Avis et Jeux Free-to-Play",
      contact: {
        name: "Paul Carouge",
        email: "contact.carouge@gmail.com"
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT"
      }
    },
    servers: [
      {
        url: "http://localhost:8000",
        description: "Serveur de développement local pendant le TP de Service Web"
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
  apis: ["./src/routes/*.js"]
};

module.exports = swaggerOptions; 