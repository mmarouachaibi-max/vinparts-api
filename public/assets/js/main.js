// assets/js/main.js

// AVANT (Mode dev séparé) :
// const API_BASE = "http://localhost:3000/api";

// MAINTENANT (Mode Pro unifié) :
// On demande au navigateur d'utiliser l'adresse actuelle + /api
const API_BASE = "/api"; 

// Fonction helper (inchangée)
function $(id) {
  return document.getElementById(id);
}