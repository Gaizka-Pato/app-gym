// Alimentos básicos sin código de barras (fruta, carne, pescado, arroz…), para apuntarlos sin escanear.
// Valores medios por 100 g de parte comestible, redondeados de tablas de composición (BEDCA / USDA); en crudo salvo
// que diga otra cosa. porcion: los gramos de una unidad o ración típica, para apuntarla de un toque.
// No es privado: va a docs/ como el resto de la app.
var Basicos = (function () {
  // [nombre, kcal, proteína, hidratos, grasa, porción (g), unidad de la porción, cafeína (mg, opcional)]
  var TABLA = [
    // Carne
    ['Pechuga de pollo', 110, 23, 0, 1.5, 150, 'filete'],
    ['Muslo de pollo (sin piel)', 120, 20, 0, 4.5, 120, 'muslo'],
    ['Pechuga de pavo', 105, 24, 0, 1, 150, 'filete'],
    ['Ternera magra', 130, 21, 0, 5, 150, 'filete'],
    ['Carne picada de ternera', 210, 19, 0, 15, 125, 'ración'],
    ['Lomo de cerdo', 145, 21, 0, 7, 150, 'filete'],
    ['Solomillo de cerdo', 120, 21, 0, 4, 150, 'ración'],
    ['Hamburguesa de ternera', 230, 17, 1, 18, 120, 'unidad'],
    ['Jamón serrano', 240, 31, 0, 13, 30, 'lonchas'],
    ['Jamón cocido', 110, 18, 1, 3.5, 30, 'lonchas'],
    ['Pavo en lonchas', 100, 19, 2, 1.5, 30, 'lonchas'],
    ['Chorizo', 455, 24, 2, 39, 30, 'ración'],
    // Pescado y marisco
    ['Salmón', 200, 20, 0, 13, 150, 'filete'],
    ['Merluza', 75, 16, 0, 1, 150, 'filete'],
    ['Bacalao', 80, 18, 0, 0.7, 150, 'filete'],
    ['Atún fresco', 130, 23, 0, 4, 150, 'filete'],
    ['Atún en lata al natural', 110, 25, 0, 1, 56, 'lata'],
    ['Atún en lata en aceite (escurrido)', 190, 26, 0, 9, 56, 'lata'],
    ['Sardinas en lata', 210, 24, 0, 12, 85, 'lata'],
    ['Gambas', 85, 19, 0, 1, 100, 'ración'],
    ['Dorada', 120, 20, 0, 4.5, 200, 'unidad'],
    ['Lubina', 110, 19, 0, 3.5, 200, 'unidad'],
    // Huevos y lácteos
    ['Huevo', 145, 12.5, 0.5, 10, 60, 'huevo'],
    ['Clara de huevo', 50, 11, 0.7, 0.2, 33, 'clara'],
    ['Leche entera', 63, 3.1, 4.7, 3.6, 250, 'vaso'],
    ['Leche semidesnatada', 46, 3.2, 4.7, 1.6, 250, 'vaso'],
    ['Leche desnatada', 34, 3.3, 4.8, 0.2, 250, 'vaso'],
    ['Bebida de avena', 45, 0.5, 7, 1.5, 250, 'vaso'],
    ['Yogur natural', 60, 3.5, 4.5, 3, 125, 'yogur'],
    ['Yogur griego', 120, 6, 4, 9, 125, 'yogur'],
    ['Yogur proteico (desnatado)', 60, 10, 4, 0.2, 125, 'yogur'],
    ['Queso fresco batido 0 %', 46, 8, 3.5, 0.1, 125, 'ración'],
    ['Queso fresco (tipo Burgos)', 175, 12, 3, 13, 50, 'ración'],
    ['Queso curado', 400, 26, 0.5, 33, 30, 'ración'],
    ['Queso mozzarella', 250, 18, 2, 19, 60, 'ración'],
    ['Requesón', 100, 12, 3.5, 4, 100, 'ración'],
    ['Kéfir', 60, 3.5, 4.5, 3, 200, 'vaso'],
    ['Mantequilla', 740, 0.6, 0.6, 82, 10, 'cucharadita'],
    // Cereales, pan y pasta (en crudo / seco)
    ['Arroz blanco (crudo)', 355, 7, 79, 0.6, 80, 'ración'],
    ['Arroz blanco (cocido)', 130, 2.7, 28, 0.3, 200, 'plato'],
    ['Arroz integral (crudo)', 350, 7.5, 74, 2.7, 80, 'ración'],
    ['Pasta (cruda)', 355, 12.5, 72, 1.5, 80, 'ración'],
    ['Pasta (cocida)', 155, 5.5, 31, 0.9, 200, 'plato'],
    ['Pan blanco (barra)', 265, 8.5, 52, 1.5, 60, 'trozo'],
    ['Pan integral', 245, 10, 43, 3, 60, 'trozo'],
    ['Pan de molde', 265, 8, 47, 4, 25, 'rebanada'],
    ['Copos de avena', 375, 13.5, 59, 7, 50, 'ración'],
    ['Tortilla de trigo (wrap)', 300, 8.5, 50, 7, 60, 'unidad'],
    ['Cuscús (crudo)', 360, 13, 72, 0.6, 80, 'ración'],
    ['Quinoa (cruda)', 370, 14, 64, 6, 80, 'ración'],
    ['Patata', 80, 2, 17, 0.1, 200, 'unidad'],
    ['Boniato', 86, 1.6, 20, 0.1, 200, 'unidad'],
    ['Corn flakes', 380, 7, 84, 0.9, 30, 'ración'],
    ['Galletas tipo María', 440, 7, 74, 12, 6, 'galleta'],
    ['Tortitas de arroz', 385, 8, 81, 3, 8, 'tortita'],
    // Legumbres (en seco / cocidas)
    ['Lentejas (secas)', 335, 24, 49, 1.5, 70, 'ración'],
    ['Lentejas (cocidas)', 115, 9, 17, 0.4, 200, 'plato'],
    ['Garbanzos (secos)', 365, 20, 55, 6, 70, 'ración'],
    ['Garbanzos (cocidos)', 140, 8, 19, 2.5, 200, 'plato'],
    ['Alubias (cocidas)', 125, 8.5, 19, 0.5, 200, 'plato'],
    ['Hummus', 175, 8, 14, 10, 30, 'ración'],
    ['Tofu', 130, 13, 2, 8, 100, 'ración'],
    // Verdura y hortalizas
    ['Brócoli', 34, 2.8, 4, 0.4, 150, 'ración'],
    ['Espinacas', 23, 2.9, 1.4, 0.4, 100, 'ración'],
    ['Lechuga', 15, 1.4, 1.5, 0.2, 80, 'ración'],
    ['Tomate', 20, 0.9, 3.5, 0.2, 150, 'unidad'],
    ['Pepino', 13, 0.7, 2, 0.1, 150, 'unidad'],
    ['Zanahoria', 38, 0.9, 7.5, 0.2, 80, 'unidad'],
    ['Cebolla', 38, 1.2, 7.5, 0.1, 100, 'unidad'],
    ['Pimiento', 25, 1, 4.5, 0.3, 150, 'unidad'],
    ['Calabacín', 17, 1.2, 2.5, 0.3, 200, 'unidad'],
    ['Berenjena', 25, 1, 4, 0.2, 200, 'unidad'],
    ['Champiñones', 22, 3, 2, 0.3, 100, 'ración'],
    ['Judías verdes', 30, 1.8, 4.5, 0.2, 150, 'ración'],
    ['Guisantes', 80, 5.4, 11, 0.4, 100, 'ración'],
    ['Maíz dulce (lata)', 85, 2.8, 15, 1.2, 80, 'ración'],
    ['Aguacate', 165, 2, 2, 15, 100, 'medio'],
    // Fruta
    ['Plátano', 90, 1.1, 20, 0.3, 120, 'unidad'],
    ['Manzana', 53, 0.3, 12, 0.2, 180, 'unidad'],
    ['Naranja', 45, 0.9, 9, 0.1, 200, 'unidad'],
    ['Mandarina', 50, 0.8, 11, 0.3, 80, 'unidad'],
    ['Pera', 55, 0.4, 12, 0.1, 180, 'unidad'],
    ['Fresas', 33, 0.7, 6, 0.3, 150, 'ración'],
    ['Uvas', 70, 0.7, 16, 0.2, 150, 'ración'],
    ['Kiwi', 60, 1.1, 12, 0.5, 80, 'unidad'],
    ['Piña', 50, 0.5, 11, 0.1, 150, 'ración'],
    ['Melón', 35, 0.8, 7.5, 0.2, 200, 'tajada'],
    ['Sandía', 30, 0.6, 7, 0.2, 250, 'tajada'],
    ['Melocotón', 40, 0.9, 9, 0.2, 150, 'unidad'],
    ['Arándanos', 57, 0.7, 12, 0.3, 100, 'ración'],
    ['Dátiles', 280, 2.5, 66, 0.4, 8, 'unidad'],
    // Frutos secos, aceites y otros
    ['Almendras', 600, 21, 7, 52, 30, 'puñado'],
    ['Nueces', 655, 15, 7, 65, 30, 'puñado'],
    ['Cacahuetes', 590, 25, 12, 49, 30, 'puñado'],
    ['Crema de cacahuete', 600, 25, 14, 50, 15, 'cucharada'],
    ['Aceite de oliva', 900, 0, 0, 100, 10, 'cucharada'],
    ['Chocolate negro 85 %', 590, 11, 15, 50, 20, 'onzas', 80],
    ['Miel', 305, 0.3, 82, 0, 15, 'cucharada'],
    ['Azúcar', 400, 0, 100, 0, 8, 'cucharadita'],
    ['Mermelada', 250, 0.4, 60, 0.1, 15, 'cucharada'],
    ['Proteína whey (polvo)', 390, 78, 7, 6, 30, 'cacito'],
    ['Pizza (media)', 265, 11, 33, 10, 300, 'media pizza'],
    ['Patatas fritas (bolsa)', 540, 6.5, 50, 35, 40, 'bolsa'],
    ['Cerveza', 43, 0.5, 3.6, 0, 330, 'lata'],
    ['Vino tinto', 85, 0.1, 2.6, 0, 150, 'copa'],
    ['Zumo de naranja', 45, 0.7, 10, 0.2, 200, 'vaso'],
    ['Refresco de cola', 42, 0, 10.6, 0, 330, 'lata', 10],
    ['Refresco de cola zero', 0.3, 0, 0, 0, 330, 'lata', 10],
    ['Bebida energética', 45, 0, 11, 0, 250, 'lata', 32],
    // Café y té (2026-11-09, por la cafeína): un expreso ~64 mg, un americano ~80, un café con leche ~60, un té ~40.
    ['Café solo (expreso)', 2, 0.1, 0, 0.2, 30, 'taza', 212],
    ['Café americano', 2, 0.1, 0, 0, 200, 'taza', 40],
    ['Café con leche', 25, 1.7, 2.5, 0.8, 200, 'taza', 30],
    ['Té', 1, 0, 0.2, 0, 250, 'taza', 16],
  ];

  function normalizar(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }

  var LISTA = TABLA.map(function (f) {
    return { id: 'b-' + normalizar(f[0]).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), nombre: f[0], kcal: f[1],
      proteina: f[2], hidratos: f[3], grasa: f[4], porcion: f[5], unidad: f[6], cafeina: f[7] || 0, fuente: 'básico' };
  });

  return { LISTA: LISTA, normalizar: normalizar };
})();
