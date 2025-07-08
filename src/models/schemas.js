const z = require("zod");

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

module.exports = {
  ProductSchema,
  UserSchema,
  UserUpdateSchema,
  UserPartialUpdateSchema,
  OrderSchema,
  OrderUpdateSchema,
  ReviewSchema,
  ReviewUpdateSchema
}; 