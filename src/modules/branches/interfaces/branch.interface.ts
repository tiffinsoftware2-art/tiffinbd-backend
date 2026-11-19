export interface BranchHours {
  mon_sat: string;
  sun: string;
}

export interface Branch {
  id: number;
  name: string;
  address: string;
  phone: string;
  hours: BranchHours;
}

export interface BranchesApiResponse {
  success: boolean;
  total: number;
  data: Branch[];
}
