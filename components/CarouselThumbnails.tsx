"use client";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, GripVertical } from "lucide-react";
import type { CreativeAsset } from "@/lib/client/creativeAsset";

interface CarouselThumbnailsProps {
  assets: CreativeAsset[];
  onReorder: (assets: CreativeAsset[]) => void;
  onRemove: (id: string) => void;
}

function Thumbnail({
  asset,
  index,
  onRemove,
}: {
  asset: CreativeAsset;
  index: number;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: asset.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative flex-shrink-0 ${isDragging ? "z-10 opacity-70" : ""}`}
    >
      <div className="relative h-28 w-28 overflow-hidden rounded-lg border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.dataUrl} alt={asset.name} className="h-full w-full object-cover" />
        <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
          {index + 1}
        </span>
        <button
          type="button"
          onClick={() => onRemove(asset.id)}
          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
          aria-label={`Remove slide ${index + 1}`}
        >
          <X className="h-3 w-3" />
        </button>
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="absolute bottom-1 right-1 cursor-grab rounded-full bg-black/60 p-1 text-white active:cursor-grabbing"
          aria-label={`Drag to reorder slide ${index + 1}`}
        >
          <GripVertical className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function CarouselThumbnails({ assets, onReorder, onRemove }: CarouselThumbnailsProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = assets.findIndex((a) => a.id === active.id);
    const newIndex = assets.findIndex((a) => a.id === over.id);
    onReorder(arrayMove(assets, oldIndex, newIndex));
  }

  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        Drag thumbnails to set the story order (slide 1 first).
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={assets.map((a) => a.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {assets.map((asset, i) => (
              <Thumbnail key={asset.id} asset={asset} index={i} onRemove={onRemove} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
