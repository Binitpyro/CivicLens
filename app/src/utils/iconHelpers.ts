import {
  IconWaterTap,
  IconStreetlight,
  IconToilet,
  IconRoad,
  IconHealth,
  IconSchool,
  IconBuilding,
} from '../components/CivicIcons';

export function getCategoryIcon(category: string, size = 20) {
  switch (category) {
    case 'Water Supply':
      return IconWaterTap({ size });
    case 'Street Lighting':
      return IconStreetlight({ size });
    case 'Public Sanitation':
      return IconToilet({ size });
    case 'Roads & Drains':
      return IconRoad({ size });
    case 'Health (PHC)':
      return IconHealth({ size });
    case 'School / Anganwadi':
      return IconSchool({ size });
    default:
      return IconBuilding({ size });
  }
}

export function getAssetTypeIcon(assetType: string, size = 20) {
  switch (assetType) {
    case 'handpump':
      return IconWaterTap({ size });
    case 'streetlight':
      return IconStreetlight({ size });
    case 'public_toilet':
      return IconToilet({ size });
    case 'drainage':
      return IconRoad({ size });
    case 'anganwadi':
      return IconBuilding({ size });
    case 'school':
      return IconSchool({ size });
    default:
      return IconBuilding({ size });
  }
}
