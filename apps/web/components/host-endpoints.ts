export interface HostReviewEndpoints {
  apiPath: string;
  resultsPath: string;
  upgradePath: string;
  claimPath?: string;
  requiresAuth: boolean;
}

export interface HostResultsEndpoints {
  apiPath: string;
  reviewPath: string;
  finalSharePath: string;
  requiresAuth: boolean;
}

export function hostTokenReviewEndpoints(hostToken: string): HostReviewEndpoints {
  return {
    apiPath: `/api/checks/host/${hostToken}`,
    resultsPath: `/h/${hostToken}`,
    upgradePath: `/api/checks/host/${hostToken}/upgrade`,
    claimPath: `/api/checks/host/${hostToken}/claim`,
    requiresAuth: false
  };
}

export function ownerReviewEndpoints(checkId: string): HostReviewEndpoints {
  return {
    apiPath: `/api/dashboard/checks/${checkId}`,
    resultsPath: `/dashboard/checks/${checkId}/results`,
    upgradePath: `/api/dashboard/checks/${checkId}/upgrade`,
    requiresAuth: true
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
