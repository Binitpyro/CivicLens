import React from 'react';
import {
  IconWaterTap,
  IconStreetlight,
  IconToilet,
  IconRoad,
  IconHealth,
  IconSchool,
  IconBuilding,
} from '../components/CivicIcons';

export function getCategoryIcon(category: string, size = 20): React.ReactElement {
  switch (category) {
    case 'Water Supply':
      return React.createElement(IconWaterTap, { size });
    case 'Street Lighting':
      return React.createElement(IconStreetlight, { size });
    case 'Public Sanitation':
      return React.createElement(IconToilet, { size });
    case 'Roads & Drains':
      return React.createElement(IconRoad, { size });
    case 'Health (PHC)':
      return React.createElement(IconHealth, { size });
    case 'School / Anganwadi':
      return React.createElement(IconSchool, { size });
    default:
      return React.createElement(IconBuilding, { size });
  }
}

export function getAssetTypeIcon(assetType: string, size = 20): React.ReactElement {
  switch (assetType) {
    case 'handpump':
      return React.createElement(IconWaterTap, { size });
    case 'streetlight':
      return React.createElement(IconStreetlight, { size });
    case 'public_toilet':
      return React.createElement(IconToilet, { size });
    case 'drainage':
      return React.createElement(IconRoad, { size });
    case 'anganwadi':
      return React.createElement(IconBuilding, { size });
    case 'school':
      return React.createElement(IconSchool, { size });
    default:
      return React.createElement(IconBuilding, { size });
  }
}


