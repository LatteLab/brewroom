import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { RecipeRail } from "@/components/recipe-rail";
import styles from "./recipes.module.css";

export const metadata: Metadata = {
  title: "Our recipes",
  description:
    "Pick a recipe from Latte Lab’s café ticket rails, from our Misugaru Latte to iced matcha, maple hojicha, espresso tonic, and affogato.",
  alternates: { canonical: "/recipes" },
};

export default function RecipesPage() {
  return (
    <main id="main" className={`shell ${styles.page}`}>
      <PageIntro
        eyebrow="A LITTLE SOMETHING TO BREW"
        title="Our recipes"
        description="A little café ritual for your own kitchen. Pick a ticket and make yourself something good."
      />
      <RecipeRail />
    </main>
  );
}
