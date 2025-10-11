export interface HitObject {
  x: number;
  y: number;
  time: number;
  type: number;
  hitSound: number;
  objectParams?: string;
  hitSample?: string;
  column?: number;
  isLongNote?: boolean;
  endTime?: number;
}

export interface TimingPoint {
  time: number;
  beatLength: number;
  meter: number;
  sampleSet: number;
  sampleIndex: number;
  volume: number;
  uninherited: boolean;
  effects: number;
}

export interface MapMetadata {
  title?: string;
  artist?: string;
  creator?: string;
  version?: string;
  audioFilename?: string;
  mode?: number;
  circleSize?: number;
}

export interface ParsedMap {
  hitObjects: HitObject[];
  timingPoints: TimingPoint[];
  metadata: MapMetadata;
  noteCount: number;
  longNoteCount: number;
  duration: number;
  keyCount: number;
}

export const HitObjectType = {
  NOTE: 1,
  HOLD: 128,
} as const;


export function parseOsuFile(osuContent: string): ParsedMap {
  const metadata = parseMetadata(osuContent);
  const timingPoints = parseTimingPoints(osuContent);
  const hitObjects = parseHitObjects(osuContent, metadata.circleSize || 4);
  
  const noteCount = hitObjects.length;
  const longNoteCount = hitObjects.filter(obj => obj.isLongNote).length;
  const duration = noteCount > 0 ? Math.max(...hitObjects.map(obj => obj.endTime || obj.time)) : 0;
  const keyCount = metadata.circleSize || 4;

  return {
    hitObjects,
    timingPoints,
    metadata,
    noteCount,
    longNoteCount,
    duration,
    keyCount,
  };
}

function parseMetadata(osuContent: string): MapMetadata {
  const metadata: MapMetadata = {};
  
  const generalMatch = osuContent.match(/\[General\]([\s\S]*?)(?=\[|$)/i);
  if (generalMatch) {
    const audioMatch = generalMatch[1].match(/AudioFilename:\s*(.+)/i);
    const modeMatch = generalMatch[1].match(/Mode:\s*(\d+)/i);
    
    if (audioMatch) metadata.audioFilename = audioMatch[1].trim();
    if (modeMatch) metadata.mode = parseInt(modeMatch[1]);
  }

  const metadataMatch = osuContent.match(/\[Metadata\]([\s\S]*?)(?=\[|$)/i);
  if (metadataMatch) {
    const titleMatch = metadataMatch[1].match(/Title:\s*(.+)/i);
    const artistMatch = metadataMatch[1].match(/Artist:\s*(.+)/i);
    const creatorMatch = metadataMatch[1].match(/Creator:\s*(.+)/i);
    const versionMatch = metadataMatch[1].match(/Version:\s*(.+)/i);
    
    if (titleMatch) metadata.title = titleMatch[1].trim();
    if (artistMatch) metadata.artist = artistMatch[1].trim();
    if (creatorMatch) metadata.creator = creatorMatch[1].trim();
    if (versionMatch) metadata.version = versionMatch[1].trim();
  }

  const difficultyMatch = osuContent.match(/\[Difficulty\]([\s\S]*?)(?=\[|$)/i);
  if (difficultyMatch) {
    const csMatch = difficultyMatch[1].match(/CircleSize:\s*([\d.]+)/i);
    if (csMatch) metadata.circleSize = parseFloat(csMatch[1]);
  }

  return metadata;
}

function parseTimingPoints(osuContent: string): TimingPoint[] {
  const timingSection = osuContent.split(/\[TimingPoints\]/i)[1];
  if (!timingSection) return [];

  const lines = timingSection
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith("//") && !line.startsWith("["));

  const timingPoints: TimingPoint[] = [];
  const timingRegex = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+),(\d+),(\d+),(\d+),([01]),(\d+)$/;

  for (const line of lines) {
    const match = timingRegex.exec(line);
    if (!match) continue;

    const [, time, beatLength, meter, sampleSet, sampleIndex, volume, uninherited, effects] = match;
    
    timingPoints.push({
      time: parseFloat(time),
      beatLength: parseFloat(beatLength),
      meter: parseInt(meter),
      sampleSet: parseInt(sampleSet),
      sampleIndex: parseInt(sampleIndex),
      volume: parseInt(volume),
      uninherited: uninherited === "1",
      effects: parseInt(effects),
    });
  }

  return timingPoints.sort((a, b) => a.time - b.time);
}

function parseHitObjects(osuContent: string, keyCount: number): HitObject[] {
  const hitObjectSection = osuContent.split(/\[HitObjects\]/i)[1];
  if (!hitObjectSection) {
    throw new Error("Section [HitObjects] introuvable dans le fichier .osu");
  }

  const lines = hitObjectSection
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith("//") && !line.startsWith("["));

  const hitObjects: HitObject[] = [];
  const hitObjectRegex = /^(\d+),(\d+),(\d+),(\d+),(\d+)(?:,([^,]+))?(?:,(.+))?$/;

  for (const line of lines) {
    const match = hitObjectRegex.exec(line);
    if (!match) continue;

    const [, x, y, time, type, hitSound, objectParams, hitSample] = match;
    
    const obj: HitObject = {
      x: parseInt(x),
      y: parseInt(y),
      time: parseInt(time),
      type: parseInt(type),
      hitSound: parseInt(hitSound),
      objectParams,
      hitSample,
    };

    obj.column = Math.floor((obj.x * keyCount) / 512);
    obj.isLongNote = (obj.type & HitObjectType.HOLD) !== 0;
    
    if (obj.isLongNote && objectParams) {
      const endTimeMatch = objectParams.match(/(\d+):(\d+):(\d+):(\d+):(.+)/);
      if (endTimeMatch) {
        obj.endTime = parseInt(endTimeMatch[1]);
      }
    }
    
    if (!obj.endTime) {
      obj.endTime = obj.time;
    }

    hitObjects.push(obj);
  }

  return hitObjects.sort((a, b) => a.time - b.time);
}

export function organizeNotesByColumn(hitObjects: HitObject[], keyCount: number): HitObject[][] {
  const columns: HitObject[][] = Array.from({ length: keyCount }, () => []);
  
  for (const obj of hitObjects) {
    const col = obj.column ?? 0;
    if (col >= 0 && col < keyCount) {
      columns[col].push(obj);
    }
  }
  
  return columns;
}