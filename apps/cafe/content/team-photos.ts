import type { StaticImageData } from "next/image";
import leannTai from "@/public/photos/team/leann-tai.webp";
import kwanwooPark from "@/public/photos/team/kwanwoo-park.webp";
import ellaLee from "@/public/photos/team/ella-lee.webp";
import coltonKim from "@/public/photos/team/colton-kim.webp";
import datTran from "@/public/photos/team/dat-tran.webp";
import jocelynPaek from "@/public/photos/team/jocelyn-paek.webp";
import joshNix from "@/public/photos/team/josh-nix.webp";
import alvinChen from "@/public/photos/team/alvin-chen.webp";
import abigailQiu from "@/public/photos/team/abigail-qiu.webp";
import alanDuan from "@/public/photos/team/alan-duan.webp";
import allisonLiu from "@/public/photos/team/allison-liu.webp";
import angelVasquez from "@/public/photos/team/angel-vasquez.webp";
import annaXing from "@/public/photos/team/anna-xing.webp";
import carolinaCichy from "@/public/photos/team/carolina-cichy.webp";
import elaineChang from "@/public/photos/team/elaine-chang.webp";
import haniaMatusik from "@/public/photos/team/hania-matusik.webp";
import isabellaWu from "@/public/photos/team/isabella-wu.webp";
import kallieWang from "@/public/photos/team/kallie-wang.webp";
import kiaraYoon from "@/public/photos/team/kiara-yoon.webp";
import leanneFan from "@/public/photos/team/leanne-fan.webp";
import maggieZhang from "@/public/photos/team/maggie-zhang.webp";
import michelleHan from "@/public/photos/team/michelle-han.webp";
import mirPark from "@/public/photos/team/mir-park.webp";
import nicoleZheng from "@/public/photos/team/nicole-zheng.webp";
import rozalenAdous from "@/public/photos/team/rozalen-adous.webp";
import samuelZhou from "@/public/photos/team/samuel-zhou.webp";
import scarletGitelson from "@/public/photos/team/scarlet-gitelson.webp";
import sophiaLee from "@/public/photos/team/sophia-lee.webp";
import tateWilhelm from "@/public/photos/team/tate-wilhelm.webp";
import timothyHabashy from "@/public/photos/team/timothy-habashy.webp";
import trinityChen from "@/public/photos/team/trinity-chen.webp";
import victoriaDang from "@/public/photos/team/victoria-dang.webp";
import terryKim from "@/public/photos/team/terry-kim.webp";

type TeamPhoto = {
  image: StaticImageData;
  objectPosition?: string;
  crop?: {
    scale: number;
    origin: string;
  };
};

export const teamPhotos: Partial<Record<string, TeamPhoto>> = {
  "LeAnn Tai": { image: leannTai },
  "Kwanwoo Park": { image: kwanwooPark },
  "Ella Lee": { image: ellaLee },
  "Colton Kim": { image: coltonKim },
  "Dat Tran": { image: datTran },
  "Jocelyn Paek": { image: jocelynPaek },
  "Josh Nix": { image: joshNix },
  "Alvin Chen": { image: alvinChen },
  "Abigail Qiu": { image: abigailQiu },
  "Alan Duan": { image: alanDuan, crop: { scale: 1.4, origin: "50% 5%" } },
  "Allison Liu": { image: allisonLiu, crop: { scale: 1.8, origin: "45% 70%" } },
  "Angel Vasquez": { image: angelVasquez },
  "Anna Xing": { image: annaXing },
  "Carolina Cichy": { image: carolinaCichy },
  "Elaine Chang": { image: elaineChang },
  "Hania Matusik": { image: haniaMatusik },
  "Isabella Wu": { image: isabellaWu },
  "Kallie Wang": { image: kallieWang },
  "Kiara Yoon": { image: kiaraYoon },
  "Leanne Fan": { image: leanneFan },
  "Maggie Zhang": { image: maggieZhang },
  "Michelle Han": { image: michelleHan },
  "Mir Park": { image: mirPark },
  "Nicole Zheng": { image: nicoleZheng },
  "Rozalen Adous": {
    image: rozalenAdous,
    objectPosition: "center bottom",
    crop: { scale: 1.3, origin: "100% 100%" },
  },
  "Samuel Zhou": { image: samuelZhou },
  "Scarlet Gitelson": { image: scarletGitelson },
  "Sophia Lee": { image: sophiaLee },
  "Tate Wilhelm": { image: tateWilhelm },
  "Timothy Habashy": { image: timothyHabashy },
  "Trinity Chen": { image: trinityChen, objectPosition: "center 70%" },
  "Victoria Dang": { image: victoriaDang },
  "Terry Kim": { image: terryKim },
};
