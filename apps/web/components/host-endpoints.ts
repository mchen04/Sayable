export interface HostReviewEndpoints {
  hostToken?: string;
  apiPath: string;
  resultsPath: string;
  upgradePath: string;
  requiresAuth: boolean;
  rememberHostToken: boolean;
}

export interface HostResultsEndpoints {
  apiPath: string;
  reviewPath: string;
  finalSharePath: string;
  requiresAuth: boolean;
}

export function hostTokenReviewEndpoints(hostToken: string): HostReviewEndpoints {
  return {
    hostToken,
    apiPath: `/api/checks/host/${hostToken}`,
    resultsPath: `/h/${hostToken}`,
    upgradePath: `/api/checks/host/${hostToken}/upgrade`,
    requiresAuth: false,
    rememberHostToken: true
  };
}

export function ownerReviewEndpoints(checkId: string): HostReviewEndpoints {
  return {
    apiPath: `/api/dashboard/checks/${checkId}`,
    resultsPath: `/dashboard/checks/${checkId}/results`,
    upgradePath: `/api/dashboard/checks/${checkId}/upgrade`,
    requiresAuth: true,
    rememberHostToken: false
  };
}

export function hostTokenResultsEndpoints(hostToken: string): HostResultsEndpoints {
  return {
    apiPath: `/api/checks/host/${hostToken}`,
    reviewPath: `/checks/${hostToken}/review`,
    finalSharePath: `/api/checks/host/${hostToken}/final-share`,
    requiresAuth: false
  };
}

export function ownerResultsEndpoints(checkId: string): HostResultsEndpoints {
  return {
    apiPath: `/api/dashboard/checks/${checkId}`,
    reviewPath: `/dashboard/checks/${checkId}/review`,
    finalSharePath: `/api/dashboard/checks/${checkId}/final-share`,
    requiresAuth: true
  };
}
