import React from 'react';
import {ReproductionComposition} from './Reproduction.tsx';
import {PrologueQuestionComposition} from './PrologueQuestion.tsx';
import {PlanVideoComposition} from './PlanVideo.tsx';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <ReproductionComposition />
      <PrologueQuestionComposition />
      <PlanVideoComposition />
    </>
  );
};
