import type { Route } from "./+types/game";
import { GameView } from "../components/game/GameView";

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Scrabble' },
    { name: 'description', content: 'Scrabble score game room' },
  ];
}

export default function GameRoute() {
  return <GameView />;
}
