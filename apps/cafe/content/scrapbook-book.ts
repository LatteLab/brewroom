import { entries, type ScrapbookEntry } from "./scrapbook.ts";

export type BookPhoto = Pick<
  ScrapbookEntry,
  "id" | "src" | "alt" | "caption" | "date" | "collection"
> & {
  width: number;
  height: number;
};
type Composition =
  | "panorama"
  | "contact-column"
  | "bottom-banner"
  | "inset"
  | "right-portrait"
  | "pair"
  | "contact-row"
  | "cascade"
  | "triptych"
  | "left-portrait";

export type BookPage = {
  composition: Composition;
  chapter: string;
  title: string;
  event: string;
  date: string;
  photos: BookPhoto[];
};

const dimensions: Record<string, [number, number]> = {
  "shared-cup-fall-2026": [1200, 1800],
  "apron-pour-fall-2026": [1200, 1800],
  "passionfruit-coldbrew-fall-2026": [1440, 1920],
  "csail-rd-event": [1920, 1280],
  "korean-momma-pourover": [1920, 1280],
  "matching-sweaters": [1920, 1280],
  "dubai-coffee-taste-test": [1280, 1920],
  "photoshoot-polaroids": [1920, 1440],
  "figma-spring-2026": [1125, 2000],
  "halloween-ghost-2025": [1280, 1920],
  "salted-caramel-butter-pecan": [1280, 1920],
  "halloween-2025": [1920, 1280],
  "halloween-filming-2025": [1280, 1920],
  "blueprint-6": [1800, 1200],
  "saas-1": [1200, 1800],
  "social-2": [1800, 1200],
  "blueprint-4": [1800, 1200],
  "social-3": [1800, 1200],
  "saas-2": [1200, 1800],
};

function original(id: string): BookPhoto {
  const entry = entries.find((item) => item.id === id);
  if (!entry || !dimensions[id])
    throw new Error(`Unknown scrapbook photo: ${id}`);
  const [width, height] = dimensions[id];
  return { ...entry, width, height };
}

// Filenames in comments refer to the original event folders.
type EventPrint = {
  caption: string;
  id: string;
  width: number;
  height: number;
  alt: string;
};
function page(
  chapter: string,
  title: string,
  event: string,
  date: string,
  composition: Composition,
  prints: (BookPhoto | EventPrint)[],
): BookPage {
  return {
    chapter,
    title,
    event,
    date,
    composition,
    photos: prints.map((print) =>
      "src" in print
        ? print
        : {
            ...print,
            src: `/photos/events/${print.id}.webp`,
            collection: event,
            date,
          },
    ),
  };
}

export const chapters = [
  { id: "rainbow", label: "Rainbow" },
  { id: "fest", label: "Fall Fest" },
  { id: "brew", label: "Brew & Meet" },
  { id: "blueprint", label: "Blueprint" },
  { id: "workshops", label: "Workshops" },
  { id: "collabs", label: "Collabs" },
  { id: "club", label: "Club life" },
] as const;

export const bookPages: BookPage[] = [
  page(
    "rainbow",
    "Taste the Rainbow",
    "Taste the Rainbow",
    "November 2026",
    "panorama",
    [
      // IMG_9296.JPG
      {
        id: "rainbow-flight",
        caption: "The tasting flight",
        width: 1600,
        height: 1200,
        alt: "Four glass coffee servers stand behind a row of bright tasting cards and little paper cups.",
      },
      // IMG_7942.JPG
      {
        id: "rainbow-cards",
        caption: "Coffee in color",
        width: 1200,
        height: 1600,
        alt: "A cup of black coffee sits beside illustrated cards in green, yellow, orange and pink.",
      },
      // 46028448_Unknown.JPG
      {
        id: "rainbow-kettles",
        caption: "A two-kettle pour",
        width: 1067,
        height: 1600,
        alt: "Hands tip pink and pale green kettles into neighboring pour-over filters.",
      },
    ],
  ),
  page(
    "rainbow",
    "Around the tasting table",
    "Taste the Rainbow",
    "November 2026",
    "contact-column",
    [
      // IMG_7955.JPG
      {
        id: "rainbow-roundtable",
        caption: "Comparing cups",
        width: 1200,
        height: 1600,
        alt: "Guests compare samples around a table dotted with colored cards.",
      },
      // IMG_9288.JPG
      {
        id: "rainbow-favorites",
        caption: "Our picks",
        width: 1600,
        height: 1200,
        alt: "Two tasters hold up their illustrated cards for the camera.",
      },
      // IMG_1196(1).JPG
      {
        id: "rainbow-heart",
        caption: "A heart for the camera",
        width: 1600,
        height: 1200,
        alt: "Two friends lean together and make a heart with their hands.",
      },
      // IMG_9331.JPG
      {
        id: "rainbow-sampling",
        caption: "Around the sample table",
        width: 1600,
        height: 1200,
        alt: "Tasters lean over their cups and compare cards along the length of the table.",
      },
    ],
  ),
  page("fest", "Fall Fest", "Fall Fest", "October 2026", "bottom-banner", [
    // IMG_8665.HEIC
    {
      id: "fall-fest-setup",
      caption: "Setting up on the grass",
      width: 1200,
      height: 1600,
      alt: "Coffee gear, boxes and coolers cover a folding table on the grass.",
    },
    // IMG_7428.JPG
    {
      id: "fall-fest-station",
      caption: "Working the Fall Fest counter",
      width: 1200,
      height: 1600,
      alt: "Aproned baristas fill cups at a table covered in bright flowers.",
    },
    // DSCF0559.JPG
    {
      id: "fest-crew-wave",
      caption: "Behind the Fall Fest counter",
      width: 1600,
      height: 1200,
      alt: "The crew leans together behind the dispensers and one member waves.",
    },
  ]),
  page("fest", "At the stand", "Fall Fest", "October 2026", "inset", [
    // DSCF0561.JPG
    {
      id: "fest-cup-portrait",
      caption: "The cup gets a close-up",
      width: 1600,
      height: 1200,
      alt: "A guest holds a yellow cup on her palm with its orange sticker facing the camera.",
    },
    // IMG_7393.JPG
    {
      id: "fall-fest-cups",
      caption: "Cups at the ready",
      width: 1200,
      height: 1600,
      alt: "Stacks of yellow paper cups sit beside the drink dispensers.",
    },
  ]),
  page(
    "fest",
    "Out on the lawn",
    "Fall Fest",
    "October 2026",
    "right-portrait",
    [
      // IMG_1056.JPG
      {
        id: "fall-fest-lawn",
        caption: "A sunny spot on the lawn",
        width: 1600,
        height: 1200,
        alt: "Two guests raise their drinks on a sunlit lawn lined with autumn trees.",
      },
      // IMG_7421.JPG
      {
        id: "fall-fest-friends",
        caption: "Three cups in the sunshine",
        width: 1600,
        height: 1200,
        alt: "Three friends hold their drinks up in the late afternoon sun.",
      },
      // IMG_1060.JPG
      {
        id: "fall-fest-cheers",
        caption: "Two thumbs up",
        width: 1200,
        height: 1600,
        alt: "An aproned member raises both thumbs against a backdrop of gold leaves.",
      },
    ],
  ),
  page("fest", "Point & shoot", "Fall Fest", "October 2026", "pair", [
    // DSCF0557.JPG
    {
      id: "fest-viewfinder",
      caption: "On the other side of the camera",
      width: 1600,
      height: 1200,
      alt: "A photographer frames two friends standing arm in arm on the sunny lawn.",
    },
    // DSCF0547.JPG
    {
      id: "fest-kresge",
      caption: "Cups outside Kresge",
      width: 1600,
      height: 1200,
      alt: "Three friends hold up their paper cups on the lawn in front of Kresge Auditorium.",
    },
  ]),
  page(
    "brew",
    "Brew and Meet",
    "Brew and Meet",
    "September 2026",
    "right-portrait",
    [
      // IMG_9134.JPG
      {
        id: "brew-meet-steps",
        caption: "The line along the steps",
        width: 1600,
        height: 1067,
        alt: "A line stretches across the concrete steps outside the glass-fronted building.",
      },
      // IMG_9151.JPG
      {
        id: "brew-meet-stickers",
        caption: "A handful of Latte Lab stickers",
        width: 1600,
        height: 1067,
        alt: "Hands fan out a stack of coral and mint Latte Lab stickers.",
      },
      // IMG_3635.HEIC
      {
        id: "brew-meet-sign",
        caption: "Our sidewalk sign",
        width: 1200,
        height: 1600,
        alt: "Two volunteers stand behind a hand-painted sign at the outdoor pop-up.",
      },
    ],
  ),
  page(
    "brew",
    "Cold brew on the steps",
    "Brew and Meet",
    "September 2026",
    "contact-row",
    [
      // IMG_9158.JPG
      {
        id: "brew-meet-conversation",
        caption: "Catching up at the counter",
        width: 1600,
        height: 1067,
        alt: "Guests and volunteers chat across the long black serving table.",
      },
      original("shared-cup-fall-2026"),
      original("apron-pour-fall-2026"),
      original("passionfruit-coldbrew-fall-2026"),
    ],
  ),
  page(
    "blueprint",
    "Hack Blueprint",
    "Hack Blueprint",
    "February 2026",
    "cascade",
    [
      original("blueprint-4"),
      original("blueprint-6"),
      // 43636640_Unknown.JPG
      {
        id: "blueprint-guests",
        caption: "A break at Blueprint",
        width: 1600,
        height: 1067,
        alt: "Two guests hold cups in front of the colorful Blueprint chalkboard.",
      },
    ],
  ),
  page(
    "blueprint",
    "From the counter",
    "Hack Blueprint",
    "February 2026",
    "bottom-banner",
    [
      // 43636224_Unknown.JPG
      {
        id: "blueprint-milk",
        caption: "Mid-pour",
        width: 1067,
        height: 1600,
        alt: "A barista tilts a white pitcher beneath the atrium lights.",
      },
      // 43636928_Unknown.JPG
      {
        id: "blueprint-finish",
        caption: "One for the chalkboard",
        width: 1067,
        height: 1600,
        alt: "A hand holds a finished drink against the chalkboard drawings.",
      },
      // 43636048_Unknown.JPG
      {
        id: "blueprint-stencils",
        caption: "Freshly stenciled",
        width: 1600,
        height: 1067,
        alt: "Three cups with stenciled designs line up on the worktable.",
      },
    ],
  ),
  page(
    "workshops",
    "February Monthly Pick",
    "February Monthly Pick",
    "February 2026",
    "cascade",
    [
      // 43633584_Unknown.JPG
      {
        id: "monthly-pick-welcome",
        caption: "Welcome to Monthly Pick",
        width: 1600,
        height: 1067,
        alt: "Two hosts stand beneath a hand-painted welcome sign facing the seated group.",
      },
      // IMG_9668.HEIC
      {
        id: "monthly-pick-pour",
        caption: "Setting up the dripper",
        width: 1600,
        height: 1200,
        alt: "An aproned brewer holds the black base of a ribbed dripper.",
      },
      // IMG_9675.JPG
      {
        id: "monthly-pick-beans",
        caption: "Beans and instant prints",
        width: 1067,
        height: 1600,
        alt: "A member holds two instant photos beside a bag of coffee beans.",
      },
    ],
  ),
  page(
    "workshops",
    "Everyone gets a pour",
    "February Monthly Pick",
    "February 2026",
    "right-portrait",
    [
      // 43635152_Unknown.JPG
      {
        id: "monthly-pick-group",
        caption: "The February crew",
        width: 1600,
        height: 1067,
        alt: "The whole workshop gathers behind the long tasting table.",
      },
      // 43634192_Unknown.JPG
      {
        id: "monthly-pick-lineup",
        caption: "Room for another brewer",
        width: 1600,
        height: 1067,
        alt: "Participants brew side by side with paper filters and kettles.",
      },
      // 43634496_Unknown.JPG
      {
        id: "monthly-pick-practice",
        caption: "Working down the table",
        width: 1067,
        height: 1600,
        alt: "Participants lean over their brewers along a white table.",
      },
    ],
  ),
  page(
    "workshops",
    "Atomic Roasting Session",
    "Atomic Roasting Session",
    "January 2026",
    "triptych",
    [
      // IMG_0596.HEIC
      {
        id: "atomic-room",
        caption: "Before the session",
        width: 1200,
        height: 1600,
        alt: "Red chairs and coffee equipment fill a bright room with blue walls.",
      },
      // IMG_0604.HEIC
      {
        id: "atomic-circle",
        caption: "Gathering at Atomic",
        width: 1200,
        height: 1600,
        alt: "The group gathers around a speaker near the tall windows.",
      },
      // IMG_0617.HEIC
      {
        id: "atomic-demo",
        caption: "At the brew bench",
        width: 1200,
        height: 1600,
        alt: "A demonstrator leans over a counter lined with drippers and cups.",
      },
    ],
  ),
  page(
    "workshops",
    "Korean Momma × Latte Lab",
    "Korean Momma collaboration",
    "November 2025",
    "contact-row",
    [
      original("korean-momma-pourover"),
      // IMG_5983.JPG
      {
        id: "korean-momma-lesson",
        caption: "Learning by the grinder",
        width: 1067,
        height: 1600,
        alt: "A presenter works beside the grinder at the head of the table.",
      },
      // IMG_4113.HEIC
      {
        id: "korean-momma-dripper",
        caption: "A place at the tasting table",
        width: 1200,
        height: 1600,
        alt: "Black kettles, a paper filter and a coffee server cover the tasting table.",
      },
      // IMG_4117.JPG
      {
        id: "korean-momma-tools",
        caption: "Brewing gear, stacked",
        width: 1067,
        height: 1600,
        alt: "Clear brewing equipment and paper filters are stacked beside the kettle.",
      },
    ],
  ),
  page("collabs", "Coffee at CSAIL", "CSAIL R&D", "February 2026", "panorama", [
    original("csail-rd-event"),
    // 43633456_Unknown.JPG
    {
      id: "csail-crew",
      caption: "Behind the CSAIL counter",
      width: 1067,
      height: 1600,
      alt: "Two smiling volunteers pose behind the counter with a paper cup.",
    },
    // 43633072_Unknown.JPG
    {
      id: "csail-line",
      caption: "The line along the blue wall",
      width: 1067,
      height: 1600,
      alt: "Guests line up along the sweeping blue wall.",
    },
  ]),
  page(
    "collabs",
    "Behind the bar",
    "CSAIL R&D",
    "February 2026",
    "bottom-banner",
    [
      // 43632928_Unknown.JPG
      {
        id: "csail-counter",
        caption: "On bar duty",
        width: 1067,
        height: 1600,
        alt: "Two volunteers stand beside stacks of cups beneath the curved blue wall.",
      },
      // 43633408_Unknown.JPG
      {
        id: "csail-menu",
        caption: "A taste at the counter",
        width: 1067,
        height: 1600,
        alt: "Two people lean over a cup and spoon beside a backlit sign.",
      },
      // 43633088_Unknown.JPG
      {
        id: "csail-room",
        caption: "A coffee break under the curved ceiling",
        width: 1600,
        height: 1067,
        alt: "Guests gather around the bar beneath a curved ceiling.",
      },
    ],
  ),
  page(
    "collabs",
    "Latte Lab × SAAS",
    "SAAS collaboration",
    "October 2025",
    "left-portrait",
    [
      // IMG_5528.JPG
      {
        id: "saas-counter",
        caption: "Serving at the SAAS pop-up",
        width: 1067,
        height: 1600,
        alt: "A volunteer serves guests across a table of cups and syrup bottles.",
      },
      // IMG_5519.JPG
      {
        id: "saas-syrup",
        caption: "At the syrup station",
        width: 1067,
        height: 1600,
        alt: "Two volunteers prepare drinks side by side at the syrup station.",
      },
      original("saas-1"),
    ],
  ),
  page(
    "collabs",
    "At the café table",
    "SAAS collaboration",
    "October 2025",
    "triptych",
    [
      // IMG_5527.JPG
      {
        id: "saas-queue",
        caption: "Waiting for a cup",
        width: 1067,
        height: 1600,
        alt: "Guests wait by the brewing station beneath the high windows.",
      },
      original("saas-2"),
      // IMG_5520.JPG
      {
        id: "saas-guest",
        caption: "Drink in hand",
        width: 1067,
        height: 1600,
        alt: "A guest smiles at the camera with a drink in hand.",
      },
    ],
  ),
  page("club", "Concord prep", "Concord prep", "October 2026", "cascade", [
    // DSCF0508.JPG
    {
      id: "concord-counter",
      caption: "The prep crew",
      width: 1600,
      height: 1200,
      alt: "Three members gather around the espresso machine in front of a red tile backsplash.",
    },
    // DSCF0512.JPG
    {
      id: "concord-portafilter",
      caption: "At the group head",
      width: 1600,
      height: 1200,
      alt: "A hand fits a portafilter into the espresso machine above its steel drip tray.",
    },
    // DSCF0501.JPG
    {
      id: "concord-pitcher",
      caption: "Finishing the pour",
      width: 1600,
      height: 1200,
      alt: "A barista tips a metal pitcher into a white cup beside the espresso machine.",
    },
  ]),
  page("club", "Over ice", "Concord prep", "October 2026", "pair", [
    // DSCF0516.JPG
    {
      id: "concord-ice",
      caption: "Over ice",
      width: 1600,
      height: 1200,
      alt: "An overhead view of an iced coffee in a white paper cup on the gray counter.",
    },
    // DSCF0520.JPG
    {
      id: "concord-rinse",
      caption: "Rinsing the drip tray",
      width: 1600,
      height: 1200,
      alt: "At the sink, two people handle the perforated metal tray and a white cup.",
    },
  ]),
  page(
    "club",
    "Social & recipe testing",
    "Social & recipe testing",
    "October 2025",
    "right-portrait",
    [
      original("social-2"),
      original("social-3"),
      // IMG_5829.JPG
      {
        id: "social-prep",
        caption: "Assembling the snacks",
        width: 1067,
        height: 1600,
        alt: "Hands assemble a snack beside a plate at the shared table.",
      },
    ],
  ),
  page(
    "club",
    "After hours",
    "Social & recipe testing",
    "October 2025",
    "left-portrait",
    [
      // IMG_3980.HEIC
      {
        id: "social-table",
        caption: "A table for the evening",
        width: 1200,
        height: 1600,
        alt: "Friends sit around a lamp-lit table under exposed ceiling pipes.",
      },
      // IMG_3987.HEIC
      {
        id: "social-cup",
        caption: "A ghost on the cup",
        width: 1200,
        height: 1600,
        alt: "A smiling guest holds up a clear cup decorated with a little ghost.",
      },
      // IMG_5820.JPG
      {
        id: "social-evening",
        caption: "Recipes after hours",
        width: 1067,
        height: 1600,
        alt: "Members sit around a warmly lit table beneath a projection screen.",
      },
    ],
  ),
  page(
    "club",
    "Halloween at Latte Lab",
    "Halloween",
    "October 2025",
    "panorama",
    [
      original("halloween-2025"),
      // IMG_5516.HEIC
      {
        id: "halloween-costumes",
        caption: "Halloween double act",
        width: 1200,
        height: 1600,
        alt: "Two costumed guests pose together beside the serving area.",
      },
      // IMG_5866.JPG
      {
        id: "halloween-trio",
        caption: "Three decorated cups",
        width: 1067,
        height: 1600,
        alt: "Three friends hold decorated cups behind the Halloween counter.",
      },
    ],
  ),
  page(
    "club",
    "Ghost on camera",
    "Halloween",
    "October 2025",
    "bottom-banner",
    [
      original("halloween-filming-2025"),
      original("halloween-ghost-2025"),
      // IMG_5855.JPG
      {
        id: "halloween-party",
        caption: "The Halloween crowd",
        width: 1600,
        height: 1067,
        alt: "Costumed guests cluster around a table of bottles and paper cups.",
      },
    ],
  ),
  page("club", "Club snapshots", "Club archive", "2025–26", "right-portrait", [
    original("matching-sweaters"),
    original("photoshoot-polaroids"),
    // 43635024_Unknown.JPG
    {
      id: "monthly-pick-aprons",
      width: 1067,
      height: 1600,
      alt: "Two apron-clad members pose shoulder to shoulder at the February workshop.",
      collection: "February Monthly Pick",
      date: "February 2026",
      src: "/photos/events/monthly-pick-aprons.webp",
      caption: "Aprons on at February Monthly Pick",
    },
  ]),
  page("club", "From the menu", "Club archive", "2025–26", "triptych", [
    original("dubai-coffee-taste-test"),
    original("figma-spring-2026"),
    original("salted-caramel-butter-pecan"),
  ]),
];

export const bookPhotos = bookPages.flatMap((page) => page.photos);
