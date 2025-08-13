import { create } from "zustand";

interface Storyboard {
  id: number;
  title: string;
  frames: any[];
}

interface StoreState {
  storyboards: Storyboard[];
  addStoryboard: (sb: Storyboard) => void;
}

const useStore = create<StoreState>((set) => ({
  storyboards: [],
  addStoryboard: (sb) =>
    set((state) => ({
      storyboards: [...state.storyboards, sb],
    })),
}));

export default useStore;