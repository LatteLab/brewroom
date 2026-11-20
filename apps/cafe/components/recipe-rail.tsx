"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { recipes } from "@/content/recipes";
import styles from "@/app/recipes/recipes.module.css";

export function RecipeRail() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const rail = useRef<HTMLUListElement>(null);
  const drinkVisual = useRef<HTMLDivElement>(null);
  const recipe = recipes[selectedIndex];

  useEffect(() => {
    // Each slip arrives once when seen. A newly selected illustration waits for
    // the counter to enter view, so its motion isn't spent below the fold.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add(styles.entered);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15 },
    );
    const slips =
      rail.current?.querySelectorAll(`.${styles.paperMotion}`) ?? [];
    for (const slip of slips) {
      if (!slip.classList.contains(styles.entered)) observer.observe(slip);
    }
    if (drinkVisual.current) observer.observe(drinkVisual.current);
    return () => observer.disconnect();
  }, [selectedIndex]);

  return (
    <>
      <section className={styles.selection} aria-label="Choose a recipe">
        <div className={styles.railHeading}>
          <p className={styles.collectionLabel}>
            {recipes.length} recipe tickets
          </p>
          <p id="recipe-selection-hint">
            <span className={styles.swipeHint}>Swipe to browse. </span>Select a
            ticket to see the recipe below.
          </p>
        </div>
        <ul
          ref={rail}
          className={styles.rail}
          aria-label="Recipe tickets"
          aria-describedby="recipe-selection-hint"
        >
          {recipes.map((item, index) => {
            const selected = selectedIndex === index;
            return (
              <li
                key={item.id}
                className={styles.hanger}
                data-selected={selected}
                style={{ "--ticket-index": index % 4 } as CSSProperties}
              >
                <span className={styles.railLight} aria-hidden="true" />
                <span className={styles.clip} aria-hidden="true">
                  <span className={styles.clipShine} />
                </span>
                <div className={styles.paperMotion}>
                  <button
                    type="button"
                    className={styles.ticket}
                    aria-pressed={selected}
                    aria-controls="recipe-details"
                    aria-labelledby={`ticket-name-${item.id}`}
                    aria-describedby={`ticket-flavor-${item.id}`}
                    onClick={() => setSelectedIndex(index)}
                  >
                    <span className={styles.ticketTop} aria-hidden="true">
                      <span>No. {String(index + 1).padStart(2, "0")}</span>
                      <span>
                        {item.kind}
                        {item.preparationTime && ` / ${item.preparationTime}`}
                      </span>
                    </span>
                    <Image
                      className={styles.ticketImage}
                      src={item.image.src}
                      width={120}
                      height={120}
                      sizes="120px"
                      alt=""
                    />
                    <span
                      className={styles.ticketName}
                      id={`ticket-name-${item.id}`}
                    >
                      {item.name}
                    </span>
                    <span
                      className={styles.ticketFlavor}
                      id={`ticket-flavor-${item.id}`}
                    >
                      {item.flavor}
                    </span>
                    <span className={styles.ticketState} aria-hidden="true">
                      {selected ? (
                        <>
                          <span>✓</span> Selected
                        </>
                      ) : (
                        <>
                          View recipe <span>↓</span>
                        </>
                      )}
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className={styles.railFootnote}>
          <a className="text-link" href="#recipe-details">
            Jump to recipe <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      {/* Announce only the change, rather than reading the entire recipe again.
          Keep focus on the ticket so keyboard users can explore every recipe. */}
      <p className="sr-only" role="status" aria-atomic="true">
        {recipe.name} recipe selected. Ingredients and instructions are below
        the tickets.
      </p>

      <article
        id="recipe-details"
        className={styles.detail}
        aria-labelledby="recipe-name"
        tabIndex={-1}
      >
        <figure className={styles.drinkFigure}>
          <div className={styles.drinkArt}>
            <p className={styles.figureLabel}>A LITTLE COFFEE BREAK</p>
            <div
              key={recipe.id}
              ref={drinkVisual}
              className={styles.drinkVisual}
            >
              <Image
                src={recipe.image.src}
                alt={recipe.image.alt}
                width={500}
                height={500}
                sizes="(max-width: 760px) 80vw, 400px"
              />
              <span className={styles.counterStamp} aria-hidden="true">
                <span>On the counter</span>
                <span>No. {String(selectedIndex + 1).padStart(2, "0")}</span>
              </span>
            </div>
            <span className={styles.handwritten} aria-hidden="true">
              made by you, enjoyed by you.
            </span>
          </div>
        </figure>
        <div className={styles.recipeBody}>
          <header className={styles.recipeHeader}>
            <p className={styles.collectionLabel}>
              Recipe {String(selectedIndex + 1).padStart(2, "0")}{" "}
              <span aria-hidden="true">/</span> {recipe.kind}
            </p>
            <h2 id="recipe-name">{recipe.name}</h2>
            <p>{recipe.description}</p>
            <dl className={styles.facts}>
              {recipe.serving && (
                <div>
                  <dt>Makes</dt>
                  <dd>{recipe.serving}</dd>
                </div>
              )}
              {recipe.preparationTime && (
                <div>
                  <dt>Prep time</dt>
                  <dd>{recipe.preparationTime}</dd>
                </div>
              )}
              {recipe.brewWater && (
                <div>
                  <dt>Brew water</dt>
                  <dd>{recipe.brewWater}</dd>
                </div>
              )}
              {recipe.updated && (
                <div>
                  <dt>Updated</dt>
                  <dd>{recipe.updated}</dd>
                </div>
              )}
            </dl>
          </header>
          <section
            className={styles.ingredients}
            aria-labelledby="ingredients-heading"
          >
            <h3 id="ingredients-heading">What you’ll need</h3>
            {recipe.ingredientGroups.map((group, index) => (
              <div
                key={group.title ?? index}
                className={styles.ingredientGroup}
              >
                {group.title && <h4>{group.title}</h4>}
                <ul>
                  {group.ingredients.map((ingredient) => (
                    <li key={ingredient.item}>
                      <span>{ingredient.quantity}</span>
                      <span>{ingredient.item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
          {recipe.equipment && (
            <section
              className={styles.equipment}
              aria-labelledby="equipment-heading"
            >
              <h3 id="equipment-heading">Equipment</h3>
              <ul>
                {recipe.equipment.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}
          <section className={styles.method} aria-labelledby="method-heading">
            <h3 id="method-heading">Let’s make it</h3>
            {recipe.method.map((part, index) => (
              <div key={part.title ?? index}>
                {part.title && <h4>{part.title}</h4>}
                <ol>
                  {part.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
          {recipe.notes && (
            <aside
              className={styles.notes}
              aria-labelledby="recipe-notes-heading"
            >
              <h3 id="recipe-notes-heading">Recipe notes</h3>
              <ul>
                {recipe.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </article>
    </>
  );
}
