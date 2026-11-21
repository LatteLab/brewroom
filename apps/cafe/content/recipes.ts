export type Recipe = {
  id: string;
  name: string;
  flavor: string;
  description: string;
  kind: string;
  serving?: string;
  preparationTime?: string;
  brewWater?: string;
  updated?: string;
  image: { src: string; alt: string; ticketSrc?: string };
  ingredientGroups: {
    title?: string;
    ingredients: { quantity: string; item: string }[];
  }[];
  equipment?: string[];
  method: { title?: string; steps: string[] }[];
  notes?: string[];
};

// Club recipes come from the Fall 2026 master recipe book, pages 2–7.
// Other source references are kept alongside their recipes for future edits.
export const recipes: [Recipe, ...Recipe[]] = [
  {
    id: "kca-misugaru-latte",
    name: "KCA Misugaru Latte",
    flavor: "Sweet misugaru cream & a cereal crunch.",
    description:
      "Oat milk latte topped with sweet misugaru cream and Jolly Pong cereal.",
    kind: "Latte",
    serving: "1 drink",
    image: {
      src: "/recipes/watercolor/misugaru-latte.webp",
      alt: "Illustration of a layered latte topped with misugaru cream and golden cereal pieces",
    },
    ingredientGroups: [
      {
        ingredients: [
          { quantity: "1 shot", item: "espresso" },
          { quantity: "150 g", item: "oat milk" },
          { quantity: "40 g", item: "whipping cream" },
          { quantity: "20 g", item: "honey or agave" },
          { quantity: "15 g", item: "misugaru powder" },
          { quantity: "To top", item: "Jolly Pong cereal" },
        ],
      },
    ],
    equipment: ["Milk frother", "Mixing container", "Serving glass and spoon"],
    method: [
      {
        title: "Prepare the misugaru cream",
        steps: [
          "Combine 40 g whipping cream, 20 g honey or agave, and 15 g misugaru powder in a mixing container.",
          "Froth with a milk frother for approximately 10 seconds, until combined and lightly thickened.",
        ],
      },
      {
        title: "Assemble the latte",
        steps: [
          "Prepare 1 shot of espresso.",
          "Combine the espresso with 150 g oat milk in a serving glass.",
          "Using the back of a spoon, gently pour the misugaru cream over the surface of the latte to create a distinct top layer.",
          "Sprinkle Jolly Pong cereal on top.",
        ],
      },
    ],
    notes: [
      "The misugaru cream should be thick enough to sit on top of the latte.",
      "Pour gently to preserve the layered appearance.",
    ],
  },
  // Ippodo Tea · https://ippodotea.com/blogs/recipes-to-brew-japanese-tea/iced-matcha-latte
  {
    id: "iced-matcha-latte",
    name: "Iced Matcha Latte",
    kind: "Tea latte",
    flavor: "Fresh green tea over cold milk and ice.",
    description:
      "Equal parts whisked matcha and cold milk make a vivid green layer that slowly ribbons through the glass.",
    serving: "1 glass",
    image: {
      src: "/recipes/watercolor/iced-matcha.webp",
      alt: "Glass of green matcha folding into milk beneath ice cubes",
    },
    ingredientGroups: [
      {
        ingredients: [
          { quantity: "3 g", item: "matcha powder" },
          { quantity: "100 ml", item: "water at 80°C (176°F)" },
          { quantity: "100 ml", item: "cold milk" },
          { quantity: "To taste", item: "ice cubes" },
        ],
      },
    ],
    method: [
      {
        steps: [
          "Pass the matcha through a fine sieve into a bowl.",
          "Add the hot water. Move a whisk briskly back and forth in an M pattern for 15 seconds.",
          "Put the milk and ice in a glass. Pour the whisked tea over them.",
        ],
      },
    ],
  },
  {
    id: "pour-over-coffee",
    name: "Pour-Over Coffee",
    flavor: "A careful spiral pour, one cup at a time.",
    description: "The recipe book’s standard pour-over procedure.",
    kind: "Brew",
    brewWater: "250 g specified",
    updated: "April 2, 2026",
    image: {
      src: "/recipes/watercolor/pour-over.webp",
      alt: "Latte Lab illustration of a green kettle pouring into a filter dripper and coffee carafe",
    },
    ingredientGroups: [
      {
        ingredients: [
          { quantity: "15 g", item: "coffee beans" },
          {
            quantity: "350 g",
            item: "water in the kettle, heated to 92°C; use the designated green 1-gallon distilled water bottle",
          },
        ],
      },
    ],
    equipment: [
      "EK43 grinder, set to 11",
      "Kettle",
      "Pour-over brewer and filter",
    ],
    method: [
      {
        title: "Preparation",
        steps: [
          "Fill the kettle with 350 g water from the designated green 1-gallon distilled water bottle.",
          "Heat the water to 92°C.",
          "Weigh 15 g coffee beans and grind on the EK43 at setting 11.",
          "Prepare the pour-over brewer and place the ground coffee in the filter.",
        ],
      },
      {
        title: "Pouring schedule",
        steps: [
          "00:00 — Bloom with 50 g water using a fast spiral pour (approximately 10 g/s). Gently spin the brewer 4 times.",
          "00:45 — Add 100 g water using a slower spiral pour (approximately 5 g/s).",
          "When the water level reaches approximately 1 cm above the bottom, add another 100 g using the same spiral-pour technique.",
        ],
      },
    ],
    notes: [
      "Spin, do not swirl: gently rotate the brewer four times during the bloom.",
      "Maintain a controlled spiral pour after the bloom. Wait for the water level to reach approximately 1 cm above the bottom before the final pour.",
      "Recipe-book clarification: the kettle starts with 350 g, but the documented pours total 250 g. Whether an additional pour is intended still needs confirmation.",
    ],
  },
  // Fever-Tree (in Dutch) · https://fever-tree.com/nl-nl/cocktail-mixers/espresso-tonic-nl
  {
    id: "espresso-tonic",
    name: "Espresso Tonic",
    kind: "Iced coffee",
    flavor: "Sparkling tonic, espresso & a slice of citrus.",
    description:
      "Bright tonic bubbles rise through a dark layer of espresso. A slice of orange or lemon scents the rim.",
    serving: "1 glass",
    image: {
      src: "/recipes/watercolor/espresso-tonic.webp",
      alt: "Tall glass of sparkling tonic with a dark espresso layer and orange slice",
    },
    ingredientGroups: [
      {
        ingredients: [
          { quantity: "150 ml", item: "Indian tonic water" },
          { quantity: "1 shot", item: "fresh espresso" },
          { quantity: "To fill glass", item: "ice" },
          { quantity: "1 slice", item: "orange or lemon" },
        ],
      },
    ],
    method: [
      {
        steps: [
          "Fill a tall glass with ice and add the tonic water.",
          "Brew the espresso. To keep the coffee in a distinct layer, pour it slowly over the back of a spoon onto the tonic.",
          "Finish with a slice of citrus.",
        ],
      },
    ],
  },
  // Hojicha Co. · https://hojicha.co/blogs/recipes/maple-hojicha-latte
  {
    id: "maple-hojicha-latte",
    name: "Maple Hojicha Latte",
    kind: "Tea latte",
    flavor: "Roasted green tea with maple milk foam.",
    description:
      "A little maple goes into the tea and a little into the milk, so even the first spoonful of foam tastes of maple.",
    serving: "1 mug",
    preparationTime: "5 min",
    image: {
      src: "/recipes/watercolor/maple-hojicha.webp",
      alt: "Wide ceramic cup of roasted tea with a swirl of maple milk foam",
    },
    ingredientGroups: [
      {
        ingredients: [
          { quantity: "1 tsp", item: "hojicha powder" },
          { quantity: "60 ml", item: "filtered water at 80°C (176°F)" },
          { quantity: "2 tsp", item: "maple syrup, divided" },
          { quantity: "180 ml", item: "milk of your choice" },
        ],
      },
    ],
    method: [
      {
        steps: [
          "Spoon half the maple syrup into a mug. In a separate bowl, whisk the powdered tea with the hot water until smooth.",
          "Pour the tea into the mug and stir to dissolve the syrup.",
          "Warm the milk with the remaining teaspoon of maple syrup. Froth the sweetened milk and pour it into the tea.",
        ],
      },
    ],
  },
  {
    id: "saas-syrup",
    name: "SAAS Syrup",
    flavor: "Rooh Afza, vanilla & a touch of rose water.",
    description: "Rooh Afza-based syrup with vanilla and rose water.",
    kind: "Syrup",
    serving: "Small batch or full syrup bottle",
    image: {
      src: "/recipes/watercolor/saas-syrup.webp",
      ticketSrc: "/recipes/watercolor/saas-syrup-ticket.png",
      alt: "Illustration of a bottle of rose-colored syrup with a cream label and brass-colored cap",
    },
    ingredientGroups: [
      {
        title: "Small batch",
        ingredients: [
          { quantity: "6 fl oz", item: "Rooh Afza syrup" },
          { quantity: "2.5 fl oz", item: "water" },
          { quantity: "1 fl oz", item: "vanilla syrup" },
          { quantity: "1 drop", item: "rose water" },
        ],
      },
      {
        title: "Full syrup bottle",
        ingredients: [
          { quantity: "16 fl oz", item: "Rooh Afza syrup" },
          { quantity: "6.7 fl oz", item: "water" },
          { quantity: "2.7 fl oz", item: "vanilla syrup" },
          { quantity: "1 g", item: "rose water" },
        ],
      },
    ],
    equipment: ["Clean mixing container or syrup bottle"],
    method: [
      {
        steps: [
          "Measure the Rooh Afza syrup, water, and vanilla syrup for your chosen batch size.",
          "Combine in a clean mixing container or syrup bottle.",
          "Add the amount of rose water specified for that batch size.",
          "Mix thoroughly until uniform.",
          "Transfer to a labeled syrup bottle if necessary.",
        ],
      },
    ],
    notes: [
      "Use the full-bottle recipe when preparing syrup for general club service.",
      "Measure rose water carefully; its flavor is concentrated. The book specifies 1 drop for the small batch and 1 g for the full bottle.",
      "Label prepared bottles with the preparation date.",
    ],
  },
  {
    id: "caramel-cold-foam",
    name: "Caramel Cold Foam",
    flavor: "A sweet caramel cream topping.",
    description: "Sweet caramel cream topping for specialty drinks.",
    kind: "Topping",
    serving: "1,000 g batch",
    image: {
      src: "/recipes/watercolor/caramel-cold-foam.webp",
      alt: "Illustration of a green mixing pitcher filled with pale caramel cream",
    },
    ingredientGroups: [
      {
        ingredients: [
          { quantity: "300 g", item: "heavy cream" },
          { quantity: "500 g", item: "oat milk" },
          { quantity: "200 g", item: "caramel syrup" },
        ],
      },
    ],
    equipment: ["Clean mixing container"],
    method: [
      {
        steps: [
          "Measure 300 g heavy cream, 500 g oat milk, and 200 g caramel syrup.",
          "Combine the ingredients in a clean container.",
          "Mix thoroughly until uniform.",
          "Store according to club food-safety procedures.",
          "Froth individual portions as needed for service.",
        ],
      },
    ],
    notes: [
      "The club’s preferred frothing method and portion size still need confirmation.",
      "Label with the preparation date and follow the club’s refrigerated-storage and discard procedures.",
    ],
  },
  // Breville · https://www.breville.com/us/en/coffee-journey/recipes/affogato.html
  {
    id: "vanilla-affogato",
    name: "Vanilla Affogato",
    kind: "Dessert",
    flavor: "Hot espresso melting a scoop of vanilla.",
    description:
      "Pull the espresso just before serving. The edges of the scoop melt into the coffee while the center stays cold enough to eat with a spoon.",
    serving: "1 dessert",
    image: {
      src: "/recipes/watercolor/vanilla-affogato.webp",
      alt: "Footed dessert glass holding espresso and a scoop of vanilla ice cream",
    },
    ingredientGroups: [
      {
        ingredients: [
          { quantity: "1 scoop", item: "vanilla ice cream" },
          { quantity: "1 double shot", item: "espresso" },
        ],
      },
    ],
    method: [
      {
        steps: [
          "Place the ice cream in a serving glass with room for the coffee.",
          "Pull a double espresso into a small jug. Pour it over the scoop while hot and serve straight away.",
        ],
      },
    ],
  },
];
